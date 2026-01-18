import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

const DEXSCREENER_API = 'https://api.dexscreener.com';

// Allowed DEX IDs - pumpswap and bagsapp (meteora variants)
const ALLOWED_DEX_IDS = ['pumpswap', 'meteoradbc', 'meteora', 'pumpfun'];

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
    const { data: existingTokens } = await supabase
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

    // Fetch market stats for new tokens (batch in groups of 30)
    // Also filter by allowed DEX IDs
    const tokenStats = new Map();
    const batchSize = 30;

    for (let i = 0; i < newSolanaTokens.length; i += batchSize) {
      const batch = newSolanaTokens.slice(i, i + batchSize);
      const addresses = batch.map(t => t.tokenAddress).join(',');

      try {
        const statsRes = await fetch(`${DEXSCREENER_API}/tokens/v1/solana/${addresses}`);
        if (statsRes.ok) {
          const pairs = await statsRes.json();
          // Group by token address, take the first pair that matches allowed DEXes
          for (const pair of pairs) {
            // Skip if not on an allowed DEX
            if (!ALLOWED_DEX_IDS.includes(pair.dexId)) {
              continue;
            }
            if (!tokenStats.has(pair.baseToken.address)) {
              tokenStats.set(pair.baseToken.address, {
                priceUsd: pair.priceUsd,
                marketCap: pair.marketCap || pair.fdv,
                volume24h: pair.volume?.h24,
                liquidity: pair.liquidity?.usd,
                pairCreatedAt: pair.pairCreatedAt,
                dexId: pair.dexId,
                // Get name and symbol from pair data as reliable source
                name: pair.baseToken.name,
                symbol: pair.baseToken.symbol
              });
            }
          }
        }
      } catch (e) {
        console.warn('Failed to fetch stats for batch:', e.message);
      }
    }

    // Filter newSolanaTokens to only include those on allowed DEXes
    const filteredTokens = newSolanaTokens.filter(t => tokenStats.has(t.tokenAddress));

    // Check if any tokens passed the DEX filter
    if (filteredTokens.length === 0) {
      return NextResponse.json({
        message: 'No tokens found on allowed DEXes (pumpswap, meteora, pumpfun)',
        added: 0,
        skipped: newSolanaTokens.length,
        allowedDexes: ALLOWED_DEX_IDS
      });
    }

    // Prepare new tokens for insertion
    const newTokens = [];

    for (const token of filteredTokens) {
      // Build links array from available social links
      const links = [];

      // Check for website fields
      if (token.website) {
        links.push({ type: 'website', url: token.website });
      }
      if (token.websites && Array.isArray(token.websites)) {
        for (const site of token.websites) {
          links.push({ type: 'website', url: typeof site === 'string' ? site : site.url });
        }
      }

      // Check for social links
      if (token.links) {
        for (const link of token.links) {
          if (link.type && link.url) {
            links.push({ type: link.type, url: link.url });
          } else if (link.label && link.url) {
            links.push({ type: link.label, url: link.url });
          } else if (typeof link === 'string') {
            links.push({ type: 'link', url: link });
          }
        }
      }

      // Check socials object
      if (token.socials) {
        for (const social of token.socials) {
          if (social.type && social.url) {
            links.push({ type: social.type, url: social.url });
          }
        }
      }

      const stats = tokenStats.get(token.tokenAddress) || {};

      newTokens.push({
        ca: token.tokenAddress,
        name: stats.name || (token.description ? extractName(token.description) : 'Unknown'),
        ticker: stats.symbol || token.symbol || 'UNKNOWN',
        description: token.description || null,
        image_url: token.icon || null,
        links: links,
        dex_id: stats.dexId || (token.url ? extractDexId(token.url) : null),
        pair_created_at: stats.pairCreatedAt ? new Date(stats.pairCreatedAt).toISOString() : null,
        status: 'new',
        stats: {
          priceUsd: stats.priceUsd || null,
          marketCap: stats.marketCap || null,
          volume24h: stats.volume24h || null,
          liquidity: stats.liquidity || null
        }
      });
    }

    // Insert new tokens
    const { error } = await supabase
      .from('tokens')
      .insert(newTokens);

    if (error) {
      throw new Error(`Supabase insert error: ${error.message}`);
    }

    return NextResponse.json({
      message: 'Tokens collected successfully',
      added: newTokens.length,
      filteredOut: newSolanaTokens.length - filteredTokens.length,
      alreadyExisted: solanaTokens.length - newSolanaTokens.length,
      allowedDexes: ALLOWED_DEX_IDS
    });

  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// Extract token name from description (first line or first sentence)
function extractName(description) {
  if (!description) return 'Unknown';
  const firstLine = description.split('\n')[0];
  const firstSentence = firstLine.split('.')[0];
  return firstSentence.slice(0, 100) || 'Unknown';
}

// Extract dex ID from DexScreener URL
function extractDexId(url) {
  if (!url) return null;
  const match = url.match(/dexscreener\.com\/\w+\/(\w+)/);
  return match ? match[1] : null;
}
