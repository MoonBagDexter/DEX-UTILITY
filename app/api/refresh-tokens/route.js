import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

const DEXSCREENER_API = 'https://api.dexscreener.com';

// Simple in-memory rate limiting
let lastRefreshTime = 0;
const RATE_LIMIT_MS = 30000; // 30 seconds between refreshes

export async function POST(request) {
  // Rate limiting
  const now = Date.now();
  if (now - lastRefreshTime < RATE_LIMIT_MS) {
    const waitSeconds = Math.ceil((RATE_LIMIT_MS - (now - lastRefreshTime)) / 1000);
    return NextResponse.json(
      { error: `Please wait ${waitSeconds} seconds before refreshing again` },
      { status: 429 }
    );
  }
  lastRefreshTime = now;

  try {
    // Optional: filter by status from request body
    const body = await request.json().catch(() => ({}));
    const statusFilter = body.status || null; // null = all statuses
    const limit = body.limit || 500;

    // Fetch tokens from database
    let query = supabase
      .from('tokens')
      .select('ca')
      .limit(limit);

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data: tokens, error: fetchError } = await query;

    if (fetchError) {
      throw new Error(`Failed to fetch tokens: ${fetchError.message}`);
    }

    if (!tokens || tokens.length === 0) {
      return NextResponse.json({
        message: 'No tokens to refresh',
        updated: 0
      });
    }

    const results = {
      updated: 0,
      errors: []
    };

    // Process tokens in batches of 30 (DexScreener limit)
    const batchSize = 30;

    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);
      const addresses = batch.map(t => t.ca).join(',');

      try {
        const statsRes = await fetch(`${DEXSCREENER_API}/tokens/v1/solana/${addresses}`);

        if (!statsRes.ok) {
          console.warn(`DexScreener API returned ${statsRes.status} for batch`);
          continue;
        }

        const pairs = await statsRes.json();

        // Group pairs by token address (take first/best pair for each token)
        const tokenData = new Map();
        for (const pair of pairs) {
          const addr = pair.baseToken?.address;
          if (addr && !tokenData.has(addr)) {
            tokenData.set(addr, {
              dex_id: pair.dexId || null,
              stats: {
                priceUsd: pair.priceUsd || null,
                marketCap: pair.marketCap || pair.fdv || null,
                volume24h: pair.volume?.h24 || null,
                liquidity: pair.liquidity?.usd || null
              },
              pair_created_at: pair.pairCreatedAt
                ? new Date(pair.pairCreatedAt).toISOString()
                : null
            });
          }
        }

        // Update each token in the batch
        for (const token of batch) {
          const data = tokenData.get(token.ca);
          if (data) {
            const { error: updateError } = await supabase
              .from('tokens')
              .update({
                dex_id: data.dex_id,
                stats: data.stats,
                pair_created_at: data.pair_created_at
              })
              .eq('ca', token.ca);

            if (updateError) {
              results.errors.push({ ca: token.ca, error: updateError.message });
            } else {
              results.updated++;
            }
          }
        }
      } catch (e) {
        console.warn('Failed to process batch:', e.message);
        results.errors.push({ batch: i, error: e.message });
      }

      // Small delay between batches to respect rate limits
      if (i + batchSize < tokens.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    return NextResponse.json({
      message: 'Token data refreshed from DexScreener',
      total: tokens.length,
      updated: results.updated,
      errors: results.errors.length > 0 ? results.errors.slice(0, 5) : undefined
    });

  } catch (error) {
    console.error('Refresh tokens error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
