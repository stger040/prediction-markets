/**
 * Global Mode arbitrage: Kalshi vs Polymarket
 * Legal for users outside the US.
 *
 * Delegates market fetching + matching to Service A (the matcher).
 * Falls back to fetching locally if MATCHER_API_URL is not configured.
 */
import { NextResponse } from 'next/server';
import { ArbApiResponse } from '@/lib/types';

// Local fallback (used in dev when matcher service isn't running)
import { fetchPolymarketMarkets } from '@/lib/polymarket';
import { fetchKalshiMarkets } from '@/lib/kalshi';
import { findMarketPairs } from '@/lib/matcher';
import { rankOpportunities, tradingFee } from '@/lib/arbitrage';

export const dynamic = 'force-dynamic';

export async function GET() {
  const matcherUrl = process.env.MATCHER_API_URL?.replace(/\/$/, '');
  const matcherKey = process.env.MATCHER_API_KEY ?? '';

  // --- Service A path ---
  if (matcherUrl) {
    try {
      const res = await fetch(`${matcherUrl}/api/opportunities`, {
        headers: { 'x-api-key': matcherKey },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`Matcher service returned ${res.status}`);
      const data: ArbApiResponse = await res.json();
      return NextResponse.json(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Matcher service error';
      console.error('[arbitrage] Matcher service failed, falling back to local:', message);
      // Fall through to local path
    }
  }

  // --- Local fallback path ---
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
        kalshiFeeEstimate: tradingFee('kalshi', 0.5), // representative at P=0.5: 1.75¢/contract
        usingDemoData: kalshiMarkets.length <= 6 && kalshiMarkets[0]?.id === 'FED-26JUL',
        fetchedAt: new Date().toISOString(),
      },
    } satisfies ArbApiResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
