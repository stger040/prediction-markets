/**
 * Arbitrage opportunities endpoint — reads from KV cache, returns instantly.
 *
 * Data is written by /api/cron/refresh on a Vercel Cron schedule.
 * This endpoint never fetches from Kalshi/Polymarket directly, so multiple
 * simultaneous frontend users have zero effect on external API load.
 *
 * Fallback: if KV is empty (first deploy before cron has run) or KV is not
 * configured (local dev), runs the pipeline inline so the service always responds.
 */
import { NextResponse } from 'next/server';
import { ArbApiResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Fast path: read from KV (Vercel KV env vars: KV_REST_API_URL + KV_REST_API_TOKEN)
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const { kv } = await import('@vercel/kv');
      const cached = await kv.get<ArbApiResponse>('arb:opportunities');

      if (cached) {
        return NextResponse.json(cached);
      }

      // KV key missing — cron hasn't run yet. Trigger a warm-up and tell the
      // client to retry rather than waiting here for the full pipeline.
      console.warn('[opportunities] KV cache empty — cron has not run yet');
      return NextResponse.json(
        { error: 'Warming up — data not ready yet. Retry in 60 seconds.' },
        { status: 503, headers: { 'Retry-After': '60' } },
      );
    } catch (err) {
      console.error('[opportunities] KV read failed, falling back:', err instanceof Error ? err.message : err);
      // Fall through to inline computation
    }
  }

  // Fallback: run the pipeline inline (local dev or KV not provisioned)
  console.warn('[opportunities] KV not configured — running pipeline inline (configure Vercel KV for production)');
  try {
    const { fetchPolymarketMarkets } = await import('@/lib/polymarket');
    const { fetchKalshiMarkets }     = await import('@/lib/kalshi');
    const { findMarketPairs }        = await import('@/lib/matcher');
    const { rankOpportunities, tradingFee } = await import('@/lib/arbitrage');

    const [polyMarkets, kalshiMarkets] = await Promise.all([
      fetchPolymarketMarkets(),
      fetchKalshiMarkets(),
    ]);

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
        kalshiFeeEstimate: tradingFee('kalshi', 0.5),
        usingDemoData,
        fetchedAt: new Date().toISOString(),
      },
    } satisfies ArbApiResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
