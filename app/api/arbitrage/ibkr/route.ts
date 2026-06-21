/**
 * US Mode arbitrage: Kalshi (standalone) vs IBKR ForecastEx
 * Fully legal for US citizens. Both platforms are CFTC-regulated.
 *
 * How it works:
 * - Fetches live prices from your standalone Kalshi account
 * - Fetches live prices from IBKR ForecastEx via IB Gateway running locally
 * - Finds matching events and calculates profit when prices diverge
 *
 * Why prices differ: Kalshi's native order book and ForecastEx's order book
 * have different sets of traders. Arbitrageurs haven't fully closed all gaps.
 */
import { NextResponse } from 'next/server';
import { fetchKalshiMarkets } from '@/lib/kalshi';
import { fetchIBKRMarkets } from '@/lib/ibkr';
import { findMarketPairs } from '@/lib/matcher';
import { rankOpportunities } from '@/lib/arbitrage';

export const dynamic = 'force-dynamic'; // Always fresh — never cache for live arb

export async function GET() {
  try {
    const [kalshiMarkets, ibkrMarkets] = await Promise.all([
      fetchKalshiMarkets(),
      fetchIBKRMarkets(),
    ]);

    // Kalshi is marketA, IBKR is marketB — matcher works on normalized questions
    const pairs = findMarketPairs(kalshiMarkets, ibkrMarkets);
    const opportunities = rankOpportunities(pairs);

    const usingDemoData = !process.env.IBKR_HOST || kalshiMarkets[0]?.id === 'FED-26JUL';

    return NextResponse.json({
      opportunities,
      meta: {
        platformACount: kalshiMarkets.length,
        platformBCount: ibkrMarkets.length,
        platformAName: 'Kalshi',
        platformBName: 'IBKR ForecastEx',
        pairsFound: pairs.length,
        opportunitiesFound: opportunities.length,
        usingDemoData,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
