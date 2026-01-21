import { supabaseServer } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { analyzeToken } from '@/lib/analysis';

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
  let analysis = null;
  let newStatus = 'deleted'; // Default to deleted if anything fails

  try {
    analysis = await analyzeToken(token);
    // utility -> kept, everything else -> deleted
    newStatus = analysis.classification === 'utility' ? 'kept' : 'deleted';
  } catch (err) {
    // AI failed - mark as deleted with error info
    analysis = { classification: 'error', confidence: 0, reasoning: err.message };
  }

  // Always update the token status - never leave it as 'new'
  try {
    const { error } = await supabaseServer
      .from('tokens')
      .update({ status: newStatus })
      .eq('ca', token.ca);

    if (error) {
      console.error(`Failed to update token ${token.ca}:`, error.message);
    }
  } catch (dbErr) {
    console.error(`DB error for token ${token.ca}:`, dbErr.message);
  }

  return { status: newStatus };
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
