import Anthropic from '@anthropic-ai/sdk';
import { supabaseServer } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request) {
  try {
    // Process only 5 tokens at a time to avoid Vercel timeout (10s hobby, 60s pro)
    // User can click multiple times to process all tokens
    const body = await request.json().catch(() => ({}));
    const limit = body.limit || 5;

    // Fetch all tokens with status='new'
    const { data: newTokens, error: fetchError } = await supabaseServer
      .from('tokens')
      .select('*')
      .eq('status', 'new')
      .limit(limit);

    if (fetchError) {
      throw new Error(`Failed to fetch tokens: ${fetchError.message}`);
    }

    if (!newTokens || newTokens.length === 0) {
      return NextResponse.json({
        message: 'No new tokens to analyze',
        processed: 0,
        kept: 0,
        deleted: 0,
        skipped: 0
      });
    }

    const results = {
      processed: 0,
      kept: 0,
      deleted: 0,
      skipped: 0,
      errors: []
    };

    // Process tokens sequentially to avoid rate limits
    for (const token of newTokens) {
      try {
        const analysis = await analyzeToken(token);

        // Determine new status based on classification
        let newStatus = 'new'; // default: keep for manual review

        if (analysis.classification === 'utility') {
          newStatus = 'kept';
          results.kept++;
        } else if (analysis.classification === 'meme') {
          newStatus = 'deleted';
          results.deleted++;
        } else {
          // unknown or low confidence - skip update
          results.skipped++;
          results.processed++;
          continue;
        }

        // Update token status in database
        const { data: updateData, error: updateError } = await supabaseServer
          .from('tokens')
          .update({
            status: newStatus,
            analysis: analysis,
            analyzed_at: new Date().toISOString()
          })
          .eq('ca', token.ca)
          .select('ca, status');

        if (updateError) {
          console.error(`Update failed for ${token.ca}:`, updateError);
          results.errors.push({ ca: token.ca, error: updateError.message });
        } else if (!updateData || updateData.length === 0) {
          console.error(`Update returned no rows for ${token.ca}`);
          results.errors.push({ ca: token.ca, error: 'No rows updated' });
        } else {
          console.log(`Updated ${token.ca} to ${newStatus}`);
        }

        results.processed++;
      } catch (err) {
        results.errors.push({ ca: token.ca, error: err.message });
        results.processed++;
      }

      // Small delay between API calls to be respectful of rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('Auto-analyze results:', {
      total: newTokens.length,
      kept: results.kept,
      deleted: results.deleted,
      skipped: results.skipped,
      errors: results.errors
    });

    return NextResponse.json({
      message: 'Auto-analysis complete',
      total: newTokens.length,
      ...results
    });

  } catch (error) {
    console.error('Auto-analyze error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
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
