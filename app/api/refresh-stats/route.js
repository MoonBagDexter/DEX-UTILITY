import { supabaseServer } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

const DEXSCREENER_API = 'https://api.dexscreener.com';

export async function POST(request) {
  try {
    const { ca } = await request.json();
    if (!ca) {
      return NextResponse.json({ error: 'ca required' }, { status: 400 });
    }

    console.log(`[refresh-stats] Fetching stats for: ${ca}`);

    const statsRes = await fetch(`${DEXSCREENER_API}/tokens/v1/solana/${ca}`);

    if (!statsRes.ok) {
      console.error(`[refresh-stats] DexScreener error: ${statsRes.status} ${statsRes.statusText}`);
      return NextResponse.json({
        error: `DexScreener error: ${statsRes.status}`,
        updated: false
      }, { status: 502 });
    }

    const data = await statsRes.json();
    console.log(`[refresh-stats] DexScreener response type: ${Array.isArray(data) ? 'array' : typeof data}`);

    // Handle both response formats: array directly or { pairs: [...] }
    let pairs = [];
    if (Array.isArray(data)) {
      pairs = data;
    } else if (data && Array.isArray(data.pairs)) {
      pairs = data.pairs;
    }

    console.log(`[refresh-stats] Found ${pairs.length} pairs`);

    if (pairs.length === 0) {
      return NextResponse.json({
        message: 'No pair data available yet - token may be too new',
        updated: false
      });
    }

    // Find the pair for this specific token (in case of multiple pairs)
    const pair = pairs.find(p =>
      p.baseToken?.address?.toLowerCase() === ca.toLowerCase()
    ) || pairs[0];

    const newStats = {
      priceUsd: pair.priceUsd || null,
      marketCap: pair.marketCap || pair.fdv || null,
      volume24h: pair.volume?.h24 || null,
      liquidity: pair.liquidity?.usd || null
    };

    console.log(`[refresh-stats] New stats:`, newStats);

    const updateData = { stats: newStats };
    if (pair.pairCreatedAt) {
      updateData.pair_created_at = new Date(pair.pairCreatedAt).toISOString();
    }

    const { data: updateResult, error } = await supabaseServer
      .from('tokens')
      .update(updateData)
      .eq('ca', ca)
      .select();

    if (error) {
      console.error(`[refresh-stats] Supabase error:`, error);
      throw new Error(error.message);
    }

    if (!updateResult || updateResult.length === 0) {
      console.warn(`[refresh-stats] Token not found in database: ${ca}`);
      return NextResponse.json({
        error: 'Token not found in database',
        updated: false
      }, { status: 404 });
    }

    console.log(`[refresh-stats] Successfully updated stats for: ${ca}`);
    return NextResponse.json({
      message: 'Stats refreshed',
      stats: newStats,
      updated: true
    });

  } catch (error) {
    console.error(`[refresh-stats] Error:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
