import Anthropic from '@anthropic-ai/sdk';
import { supabaseServer } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request) {
  try {
    // Process 20 tokens in parallel - fits within Vercel's 10s hobby timeout
    const body = await request.json().catch(() => ({}));
    const limit = body.limit || 20;

    // Fetch tokens with status='new'
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
        total: 0,
        kept: 0,
        deleted: 0,
        skipped: 0
      });
    }

    // Process all tokens in parallel
    const processResults = await Promise.all(
      newTokens.map(token => processToken(token))
    );

    // Aggregate results
    const results = processResults.reduce(
      (acc, r) => ({
        kept: acc.kept + (r.status === 'kept' ? 1 : 0),
        deleted: acc.deleted + (r.status === 'deleted' ? 1 : 0),
        skipped: acc.skipped + (r.status === 'skipped' ? 1 : 0),
        errors: r.error ? [...acc.errors, r.error] : acc.errors,
      }),
      { kept: 0, deleted: 0, skipped: 0, errors: [] }
    );

    console.log('Auto-analyze results:', {
      total: newTokens.length,
      ...results
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

async function processToken(token) {
  try {
    const analysis = await analyzeToken(token);

    // Determine new status based on classification
    if (analysis.classification !== 'utility' && analysis.classification !== 'meme') {
      return { status: 'skipped' };
    }

    const newStatus = analysis.classification === 'utility' ? 'kept' : 'deleted';

    // Update token status in database
    const { data, error } = await supabaseServer
      .from('tokens')
      .update({ status: newStatus })
      .eq('ca', token.ca)
      .select('ca');

    if (error || !data?.length) {
      return { status: 'skipped', error: { ca: token.ca, msg: error?.message || 'No rows updated' } };
    }

    return { status: newStatus };
  } catch (err) {
    return { status: 'skipped', error: { ca: token.ca, msg: err.message } };
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

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;

  if (process.env.CRON_SECRET && authHeader !== expectedAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Reuse POST logic
  return POST(new Request(request.url, {
    method: 'POST',
    body: JSON.stringify({ limit: 20 })
  }));
}
