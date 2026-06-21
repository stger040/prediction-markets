/**
 * Global Mode arbitrage: Kalshi vs Polymarket
 * Legal for users outside the US.
 */
import { NextResponse } from 'next/server';
import { fetchPolymarketMarkets } from '@/lib/polymarket';
import { fetchKalshiMarkets } from '@/lib/kalshi';
import { findMarketPairs } from '@/lib/matcher';
import { rankOpportunities, PAYOUT_FEE } from '@/lib/arbitrage';

export const dynamic = 'force-dynamic'; // never cache — always fresh prices

export async function GET() {
  console.log('[arbitrage] Fetching live data at', new Date().toISOString());

  try {
    const [polymarkets, kalshiMarkets] = await Promise.all([
      fetchPolymarketMarkets(),
      fetchKalshiMarkets(),
    ]);

    const pairs = findMarketPairs(polymarkets, kalshiMarkets);
    const { opportunities, nearMisses } = rankOpportunities(pairs);

    return NextResponse.json({
      opportunities,
      nearMisses,
      meta: {
        platformACount: polymarkets.length,
        platformBCount: kalshiMarkets.length,
        platformAName: 'Polymarket',
        platformBName: 'Kalshi',
        pairsFound: pairs.length,
        opportunitiesFound: opportunities.length,
        nearMissCount: nearMisses.length,
        kalshiFeeEstimate: PAYOUT_FEE.kalshi,
        usingDemoData: kalshiMarkets.length <= 6 && kalshiMarkets[0]?.id === 'FED-26JUL',
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
