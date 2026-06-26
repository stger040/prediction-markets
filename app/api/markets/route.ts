import { NextResponse } from 'next/server';
import { fetchPolymarketMarkets } from '@/lib/polymarket';
import { fetchKalshiMarkets } from '@/lib/kalshi';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [polymarkets, kalshiMarkets] = await Promise.allSettled([
      fetchPolymarketMarkets(),
      fetchKalshiMarkets(),
    ]);

    return NextResponse.json({
      polymarket: polymarkets.status === 'fulfilled' ? polymarkets.value : [],
      kalshi: kalshiMarkets.status === 'fulfilled' ? kalshiMarkets.value : [],
      polymarketError: polymarkets.status === 'rejected' ? polymarkets.reason?.message : null,
      kalshiError: kalshiMarkets.status === 'rejected' ? kalshiMarkets.reason?.message : null,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch markets' }, { status: 500 });
  }
}
