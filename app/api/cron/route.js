import { supabaseServer } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { DEXSCREENER_API } from '@/lib/constants';
import { fetchBatchTokenStats, extractLinks, extractName } from '@/lib/dexscreener';
import { fetchHeliusMetadata } from '@/lib/helius';
import { isAllowedDex } from '@/lib/dex';

export async function GET(request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;

  if (authHeader !== expectedAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
    const tokensToAnalyze = [];

    // First pass: build token data
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
        dex_id: stats.dexId || (token.url ? extractDexId(token.url) : null),
        pair_created_at: stats.pairCreatedAt ? new Date(stats.pairCreatedAt).toISOString() : null,
        stats: {
          priceUsd: stats.priceUsd || null,
          marketCap: stats.marketCap || null,
          volume24h: stats.volume24h || null,
          liquidity: stats.liquidity || null
        }
      });
    }

    // Second pass: fetch Helius metadata for tokens with missing data
    const tokensNeedingHelius = tokenDataList.filter(
      t => t.name === 'Unknown' || t.ticker === 'UNKNOWN'
    );

    if (tokensNeedingHelius.length > 0 && process.env.HELIUS_API_KEY) {
      const heliusResults = await Promise.all(
        tokensNeedingHelius.map(t => fetchHeliusMetadata(t.ca))
      );

      // Update tokens with Helius data
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

    // Third pass: set status and categorize
    for (const tokenData of tokenDataList) {
      // Only keep tokens from allowed DEXes (bags, pump, bonk)
      // Everything else goes straight to deleted
      if (isAllowedDex(tokenData)) {
        tokenData.status = 'new';
        tokensToAnalyze.push(tokenData);
      } else {
        tokenData.status = 'deleted';
      }

      newTokens.push(tokenData);
    }

    // Insert new tokens
    const { error } = await supabaseServer
      .from('tokens')
      .insert(newTokens);

    if (error) {
      throw new Error(`Supabase insert error: ${error.message}`);
    }

    // Fire-and-forget: trigger analysis without blocking
    const autoDeleted = newTokens.length - tokensToAnalyze.length;

    if (tokensToAnalyze.length > 0) {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:3000');

      // Don't await - let it run independently
      fetch(`${baseUrl}/api/auto-analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 20 })
      }).catch(err => console.error('Auto-analyze trigger failed:', err.message));
    }

    return NextResponse.json({
      message: 'Tokens collected, analysis triggered',
      added: newTokens.length,
      allowedDex: tokensToAnalyze.length,
      autoDeleted: autoDeleted,
      alreadyExisted: solanaTokens.length - newSolanaTokens.length
    });

  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// Extract dex ID from DexScreener URL
function extractDexId(url) {
  if (!url) return null;
  const match = url.match(/dexscreener\.com\/\w+\/(\w+)/);
  return match ? match[1] : null;
}
