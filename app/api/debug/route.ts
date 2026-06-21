import { NextResponse } from 'next/server';
import { fetchPolymarketMarkets } from '@/lib/polymarket';
import { fetchKalshiMarkets } from '@/lib/kalshi';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [polyResult, kalshiResult] = await Promise.allSettled([
    fetchPolymarketMarkets(),
    fetchKalshiMarkets(),
  ]);

  const poly   = polyResult.status   === 'fulfilled' ? polyResult.value   : [];
  const kalshi = kalshiResult.status === 'fulfilled' ? kalshiResult.value : [];

  return NextResponse.json({
    polymarket: {
      count: poly.length,
      error: polyResult.status === 'rejected' ? String(polyResult.reason) : null,
      sample: poly.slice(0, 3).map(m => ({
        question: m.question,
        yesPrice: m.yesPrice,
        noPrice: m.noPrice,
        conditionId: m.conditionId ?? null,
      })),
    },
    kalshi: {
      count: kalshi.length,
      error: kalshiResult.status === 'rejected' ? String(kalshiResult.reason) : null,
      sample: kalshi.slice(0, 3).map(m => ({
        question: m.question,
        yesPrice: m.yesPrice,
        noPrice: m.noPrice,
        slug: m.slug,
      })),
    },
    fetchedAt: new Date().toISOString(),
  });
}
