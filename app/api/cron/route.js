import Anthropic from '@anthropic-ai/sdk';
import { supabaseServerServer } from '@/lib/supabaseServer-server';
import { NextResponse } from 'next/server';

const DEXSCREENER_API = 'https://api.dexscreener.com';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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

    // Fetch market stats for new tokens (batch in groups of 30)
    const tokenStats = new Map();
    const batchSize = 30;

    for (let i = 0; i < newSolanaTokens.length; i += batchSize) {
      const batch = newSolanaTokens.slice(i, i + batchSize);
      const addresses = batch.map(t => t.tokenAddress).join(',');

      try {
        const statsRes = await fetch(`${DEXSCREENER_API}/tokens/v1/solana/${addresses}`);
        if (statsRes.ok) {
          const pairs = await statsRes.json();
          // Group by token address, take the first pair (usually highest liquidity)
          for (const pair of pairs) {
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

    // Prepare new tokens for insertion
    const newTokens = [];

    for (const token of newSolanaTokens) {
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
    const { error } = await supabaseServer
      .from('tokens')
      .insert(newTokens);

    if (error) {
      throw new Error(`Supabase insert error: ${error.message}`);
    }

    // Auto-analyze the newly inserted tokens
    const analysisResults = await autoAnalyzeTokens(newTokens);

    return NextResponse.json({
      message: 'Tokens collected and analyzed successfully',
      added: newTokens.length,
      alreadyExisted: solanaTokens.length - newSolanaTokens.length,
      analysis: analysisResults
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

// Auto-analyze tokens and update their status
async function autoAnalyzeTokens(tokens) {
  const results = {
    processed: 0,
    kept: 0,
    deleted: 0,
    skipped: 0,
    errors: []
  };

  for (const token of tokens) {
    try {
      const analysis = await analyzeToken(token);

      let newStatus = 'new';

      if (analysis.classification === 'utility') {
        newStatus = 'kept';
        results.kept++;
      } else if (analysis.classification === 'meme') {
        newStatus = 'deleted';
        results.deleted++;
      } else {
        results.skipped++;
        results.processed++;
        continue;
      }

      const { error: updateError } = await supabaseServer
        .from('tokens')
        .update({
          status: newStatus,
          analysis: analysis,
          analyzed_at: new Date().toISOString()
        })
        .eq('ca', token.ca);

      if (updateError) {
        results.errors.push({ ca: token.ca, error: updateError.message });
      }

      results.processed++;
    } catch (err) {
      results.errors.push({ ca: token.ca, error: err.message });
      results.processed++;
    }

    // Small delay between API calls
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return results;
}

async function analyzeToken(token) {
  const tokenContext = buildTokenContext(token);

  const message = await anthropic.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: `Is this a MEME coin or does it have real UTILITY? Analyze:

${tokenContext}

Reply with JSON only:
{"classification":"utility" or "meme","confidence":0-100,"reasoning":"1 sentence"}`
      }
    ]
  });

  const responseText = message.content[0].text;

  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText);
  } catch {
    return {
      classification: 'unknown',
      confidence: 0,
      reasoning: 'Failed to parse AI response'
    };
  }
}

function buildTokenContext(token) {
  const parts = [];

  parts.push(`Token Name: ${token.name || 'Unknown'}`);
  parts.push(`Ticker: ${token.ticker || 'Unknown'}`);

  if (token.description) {
    parts.push(`Description: ${token.description}`);
  }

  if (token.links && token.links.length > 0) {
    const linkTypes = token.links.map(l => l.type).join(', ');
    parts.push(`Social Links: ${linkTypes}`);

    const website = token.links.find(l => l.type === 'website');
    if (website) {
      parts.push(`Website: ${website.url}`);
    }
  }

  if (token.stats) {
    if (token.stats.marketCap) {
      parts.push(`Market Cap: $${formatNumber(token.stats.marketCap)}`);
    }
    if (token.stats.liquidity) {
      parts.push(`Liquidity: $${formatNumber(token.stats.liquidity)}`);
    }
    if (token.stats.volume24h) {
      parts.push(`24h Volume: $${formatNumber(token.stats.volume24h)}`);
    }
  }

  return parts.join('\n');
}

function formatNumber(num) {
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(2) + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(2) + 'K';
  }
  return num.toFixed(2);
}
