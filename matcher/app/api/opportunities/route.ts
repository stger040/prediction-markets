/**
 * Main arbitrage opportunities endpoint.
 * Fetches Polymarket + Kalshi markets, runs IDF fuzzy matching,
 * and returns confirmed opportunities + near misses.
 *
 * Cached for 60 seconds via ISR — fresh enough for arb scanning,
 * light enough to handle concurrent frontend users without hammering upstream APIs.
 */
import { NextResponse } from 'next/server';
import { fetchPolymarketMarkets } from '@/lib/polymarket';
import { fetchKalshiMarkets } from '@/lib/kalshi';
import { findMarketPairs } from '@/lib/matcher';
import { rankOpportunities, PAYOUT_FEE } from '@/lib/arbitrage';

export const revalidate = 60; // ISR: regenerate at most once per minute

export async function GET() {
  try {
    const [polyMarkets, kalshiMarkets] = await Promise.all([
      fetchPolymarketMarkets(),
      fetchKalshiMarkets(),
    ]);

    // Polymarket = marketA, Kalshi = marketB
    const pairs = findMarketPairs(polyMarkets, kalshiMarkets);
    const { opportunities, nearMisses } = rankOpportunities(pairs);

    const usingDemoData = !kalshiMarkets.length || kalshiMarkets[0]?.id === 'FED-26JUL';

    return NextResponse.json({
      opportunities,
      nearMisses,
      meta: {
        platformACount: polyMarkets.length,
        platformBCount: kalshiMarkets.length,
        platformAName: 'Polymarket',
        platformBName: 'Kalshi',
        pairsFound: pairs.length,
        opportunitiesFound: opportunities.length,
        nearMissCount: nearMisses.length,
        kalshiFeeEstimate: PAYOUT_FEE.kalshi,
        usingDemoData,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
