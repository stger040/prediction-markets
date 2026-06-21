/**
 * Raw pairs endpoint — returns all matched market pairs with their scores.
 * Useful for debugging the matching algorithm without arbitrage filtering.
 */
import { NextResponse } from 'next/server';
import { fetchPolymarketMarkets } from '@/lib/polymarket';
import { fetchKalshiMarkets } from '@/lib/kalshi';
import { findMarketPairs } from '@/lib/matcher';

export const revalidate = 60;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);

  try {
    const [polyMarkets, kalshiMarkets] = await Promise.all([
      fetchPolymarketMarkets(),
      fetchKalshiMarkets(),
    ]);

    const pairs = findMarketPairs(polyMarkets, kalshiMarkets);

    return NextResponse.json({
      pairs: pairs.slice(0, limit).map(p => ({
        score: p.matchScore,
        polyQuestion: p.marketA.question,
        polySlug: p.marketA.slug,
        kalshiQuestion: p.marketB.question,
        kalshiSlug: p.marketB.slug,
        polyYes: p.marketA.yesPrice,
        kalshiYes: p.marketB.yesPrice,
      })),
      meta: {
        polyCount: polyMarkets.length,
        kalshiCount: kalshiMarkets.length,
        totalPairs: pairs.length,
        showing: Math.min(pairs.length, limit),
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
