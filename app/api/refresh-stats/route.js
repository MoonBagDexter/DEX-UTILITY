import { supabaseServer } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

const DEXSCREENER_API = 'https://api.dexscreener.com';

export async function POST(request) {
  try {
    const { ca } = await request.json();
    if (!ca) return NextResponse.json({ error: 'ca required' }, { status: 400 });

    const statsRes = await fetch(`${DEXSCREENER_API}/tokens/v1/solana/${ca}`);
    if (!statsRes.ok) return NextResponse.json({ error: 'DexScreener error' }, { status: 502 });

    const data = await statsRes.json();
    const pairs = data.pairs || [];
    if (pairs.length === 0) {
      return NextResponse.json({ message: 'No pair data yet', updated: false });
    }

    const pair = pairs[0];
    const newStats = {
      priceUsd: pair.priceUsd || null,
      marketCap: pair.marketCap || pair.fdv || null,
      volume24h: pair.volume?.h24 || null,
      liquidity: pair.liquidity?.usd || null
    };

    const updateData = { stats: newStats };
    if (pair.pairCreatedAt) {
      updateData.pair_created_at = new Date(pair.pairCreatedAt).toISOString();
    }

    const { error } = await supabaseServer
      .from('tokens')
      .update(updateData)
      .eq('ca', ca);

    if (error) throw new Error(error.message);

    return NextResponse.json({ message: 'Stats refreshed', stats: newStats, updated: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
