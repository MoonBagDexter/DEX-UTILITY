import { supabaseServer } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { DEXSCREENER_API, RATE_LIMIT_MS } from '@/lib/constants';
import { fetchBatchTokenStats, extractLinks, extractName } from '@/lib/dexscreener';
import { fetchHeliusMetadata } from '@/lib/helius';
import { isAllowedDex } from '@/lib/dex';

// Simple in-memory rate limiting (resets on deploy)
let lastRefreshTime = 0;

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
    // Fetch latest token profiles from DexScreener
    const profilesRes = await fetch(`${DEXSCREENER_API}/token-profiles/latest/v1`);

    if (!profilesRes.ok) {
      throw new Error(`DexScreener API error: ${profilesRes.status}`);
    }

    const profiles = await profilesRes.json();

    // Filter for Solana tokens only
    const solanaTokens = profiles.filter(token => token.chainId === 'solana');

    if (solanaTokens.length === 0) {
      return NextResponse.json({
        message: 'No new Solana tokens found',
        added: 0,
        skipped: 0
      });
    }

    // Get existing CAs to avoid duplicates
    const cas = solanaTokens.map(t => t.tokenAddress);
    const { data: existingTokens } = await supabaseServer
      .from('tokens')
      .select('ca')
      .in('ca', cas);

    const existingCAs = new Set(existingTokens?.map(t => t.ca) || []);

    // Filter out existing tokens
    const newSolanaTokens = solanaTokens.filter(t => !existingCAs.has(t.tokenAddress));

    if (newSolanaTokens.length === 0) {
      return NextResponse.json({
        message: 'All tokens already exist',
        added: 0,
        skipped: solanaTokens.length
      });
    }

    // Fetch market stats for new tokens
    const addresses = newSolanaTokens.map(t => t.tokenAddress);
    const tokenStats = await fetchBatchTokenStats(addresses);

    // Prepare new tokens for insertion
    const newTokens = [];
    const tokenDataList = [];

    for (const token of newSolanaTokens) {
      const links = extractLinks(token);
      const stats = tokenStats.get(token.tokenAddress) || {};

      tokenDataList.push({
        ca: token.tokenAddress,
        name: stats.name || (token.description ? extractName(token.description) : 'Unknown'),
        ticker: stats.symbol || token.symbol || 'UNKNOWN',
        description: token.description || null,
        image_url: token.icon || null,
        links: links,
        dex_id: stats.dexId || null,
        pair_created_at: stats.pairCreatedAt ? new Date(stats.pairCreatedAt).toISOString() : null,
        stats: {
          priceUsd: stats.priceUsd || null,
          marketCap: stats.marketCap || null,
          volume24h: stats.volume24h || null,
          liquidity: stats.liquidity || null
        }
      });
    }

    // Fetch Helius metadata for tokens with missing data
    const tokensNeedingHelius = tokenDataList.filter(
      t => t.name === 'Unknown' || t.ticker === 'UNKNOWN'
    );

    if (tokensNeedingHelius.length > 0 && process.env.HELIUS_API_KEY) {
      const heliusResults = await Promise.all(
        tokensNeedingHelius.map(t => fetchHeliusMetadata(t.ca))
      );

      for (let i = 0; i < tokensNeedingHelius.length; i++) {
        const helius = heliusResults[i];
        if (!helius) continue;

        const token = tokensNeedingHelius[i];

        if (token.name === 'Unknown' && helius.name) {
          token.name = helius.name;
        }
        if (token.ticker === 'UNKNOWN' && helius.symbol) {
          token.ticker = helius.symbol;
        }
        if (!token.description && helius.description) {
          token.description = helius.description;
        }
        if (!token.image_url && helius.image) {
          token.image_url = helius.image;
        }
        if (helius.externalUrl && !token.links.some(l => l.type === 'website')) {
          token.links.push({ type: 'website', url: helius.externalUrl });
        }
      }
    }

    // Set status for all tokens
    for (const tokenData of tokenDataList) {
      // Only keep tokens from allowed DEXes (bags, pump, bonk)
      // Everything else goes straight to deleted
      tokenData.status = isAllowedDex(tokenData) ? 'new' : 'deleted';
      newTokens.push(tokenData);
    }

    // Insert new tokens
    const { error } = await supabaseServer
      .from('tokens')
      .insert(newTokens);

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    const allowedCount = newTokens.filter(t => t.status === 'new').length;
    const autoDeleted = newTokens.length - allowedCount;

    return NextResponse.json({
      message: 'Tokens refreshed successfully',
      added: newTokens.length,
      allowedDex: allowedCount,
      autoDeleted: autoDeleted
    });

  } catch (error) {
    console.error('Refresh error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
