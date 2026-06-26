/**
 * Cron job: fetch all markets, run matching pipeline, write result to KV.
 *
 * Called by Vercel Cron on a schedule (see vercel.json).
 * This is the ONLY place that hits Kalshi/Polymarket APIs — /api/opportunities
 * just reads the cached result from KV.
 *
 * Vercel automatically injects Authorization: Bearer <CRON_SECRET> on cron calls.
 * Set CRON_SECRET in the Vercel dashboard to protect this endpoint.
 */
import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';
import { fetchPolymarketMarkets } from '@/lib/polymarket';
import { fetchKalshiMarkets } from '@/lib/kalshi';
import { findMarketPairs } from '@/lib/matcher';
import { rankOpportunities, tradingFee } from '@/lib/arbitrage';
import { ArbApiResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export const KV_KEY = 'arb:opportunities';
export const KV_TTL = 300; // 5 min — stale data expires rather than serving forever

export async function GET(req: Request) {
  // Auth: Vercel Cron injects this header automatically when CRON_SECRET is set.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const start = Date.now();

  const [polyMarkets, kalshiMarkets] = await Promise.all([
    fetchPolymarketMarkets(),
    fetchKalshiMarkets(),
  ]);

  const pairs = findMarketPairs(polyMarkets, kalshiMarkets);
  const { opportunities, nearMisses } = rankOpportunities(pairs);

  const usingDemoData = !kalshiMarkets.length || kalshiMarkets[0]?.id === 'FED-26JUL';

  const payload: ArbApiResponse = {
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
      kalshiFeeEstimate: tradingFee('kalshi', 0.5),
      usingDemoData,
      fetchedAt: new Date().toISOString(),
    },
  };

  await kv.set(KV_KEY, payload, { ex: KV_TTL });

  const elapsed = Date.now() - start;
  console.log(`[cron/refresh] Done in ${elapsed}ms — ${opportunities.length} opps, ${nearMisses.length} near-misses`);

  return NextResponse.json({
    ok: true,
    elapsedMs: elapsed,
    opportunitiesFound: opportunities.length,
    nearMissCount: nearMisses.length,
    fetchedAt: payload.meta.fetchedAt,
  });
}
