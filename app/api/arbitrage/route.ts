import { NextResponse } from 'next/server';
import { fetchPolymarketMarkets } from '@/lib/polymarket';
import { fetchKalshiMarkets } from '@/lib/kalshi';
import { findMarketPairs } from '@/lib/matcher';
import { rankOpportunities } from '@/lib/arbitrage';

export const revalidate = 30;

export async function GET() {
  try {
    const [polymarkets, kalshiMarkets] = await Promise.all([
      fetchPolymarketMarkets(),
      fetchKalshiMarkets(),
    ]);

    const pairs = findMarketPairs(polymarkets, kalshiMarkets);
    const opportunities = rankOpportunities(pairs);

    return NextResponse.json({
      opportunities,
      meta: {
        polymarketCount: polymarkets.length,
        kalshiCount: kalshiMarkets.length,
        pairsFound: pairs.length,
        opportunitiesFound: opportunities.length,
        usingDemoData: !process.env.KALSHI_EMAIL,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
