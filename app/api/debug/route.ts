import { NextResponse } from 'next/server';
import { fetchPolymarketMarkets } from '@/lib/polymarket';
import { fetchKalshiMarkets } from '@/lib/kalshi';
import { findMarketPairs, scoreMarketMatch } from '@/lib/matcher';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.toLowerCase().trim() ?? '';

  const [polyResult, kalshiResult] = await Promise.allSettled([
    fetchPolymarketMarkets(),
    fetchKalshiMarkets(),
  ]);

  const poly   = polyResult.status   === 'fulfilled' ? polyResult.value   : [];
  const kalshi = kalshiResult.status === 'fulfilled' ? kalshiResult.value : [];

  // Category distribution — tells us what topic areas each platform covers
  const polyCategories  = countBy(poly,   m => m.category);
  const kalshiCategories = countBy(kalshi, m => m.category);

  // Keyword search — pass ?q=world+cup or ?q=fifa to see matching markets
  const polyMatches   = q ? poly.filter(m =>
    m.question.toLowerCase().includes(q) || m.slug.toLowerCase().includes(q)
  ) : [];
  const kalshiMatches = q ? kalshi.filter(m =>
    m.question.toLowerCase().includes(q) || m.slug.toLowerCase().includes(q)
  ) : [];

  // Cross-score: for each Polymarket hit, show best Kalshi match score
  const crossScores = q
    ? polyMatches.slice(0, 5).map(pm => {
        let best = { score: 0, question: '', slug: '' };
        for (const km of kalshi) {
          const s = scoreMarketMatch(pm, km);
          if (s > best.score) best = { score: s, question: km.question, slug: km.slug };
        }
        return {
          polyQuestion: pm.question,
          polyYes: pm.yesPrice,
          bestKalshiMatch: best.question,
          bestKalshiSlug: best.slug,
          matchScore: best.score,
        };
      })
    : [];

  return NextResponse.json({
    polymarket: {
      count: poly.length,
      error: polyResult.status === 'rejected' ? String(polyResult.reason) : null,
      categories: polyCategories,
      ...(q ? {
        searchHits: polyMatches.length,
        results: polyMatches.slice(0, 10).map(m => ({
          question: m.question, yesPrice: m.yesPrice, noPrice: m.noPrice, slug: m.slug,
        })),
      } : {
        sample: poly.slice(0, 3).map(m => ({
          question: m.question, yesPrice: m.yesPrice, noPrice: m.noPrice, conditionId: m.conditionId ?? null,
        })),
      }),
    },
    kalshi: {
      count: kalshi.length,
      error: kalshiResult.status === 'rejected' ? String(kalshiResult.reason) : null,
      categories: kalshiCategories,
      ...(q ? {
        searchHits: kalshiMatches.length,
        results: kalshiMatches.slice(0, 10).map(m => ({
          question: m.question, yesPrice: m.yesPrice, noPrice: m.noPrice, slug: m.slug,
        })),
      } : {
        sample: kalshi.slice(0, 3).map(m => ({
          question: m.question, yesPrice: m.yesPrice, noPrice: m.noPrice, slug: m.slug,
        })),
      }),
    },
    ...(q ? { crossScores } : {}),
    fetchedAt: new Date().toISOString(),
  });
}

function countBy<T>(arr: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of arr) {
    const k = key(item);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 15)
  );
}
