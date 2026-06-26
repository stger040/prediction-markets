/**
 * Debug endpoint: market data explorer
 *
 * GET /api/debug                — category distribution + sample normalized questions
 * GET /api/debug?q=world+cup   — keyword search across both platforms + cross-scores
 * GET /api/debug?near=1        — near-miss pairs (score 0.45–0.64) with score breakdown
 * GET /api/debug?near=1&cat=Sports — filter near-misses by canonical category
 */
import { NextResponse } from 'next/server';
import { fetchPolymarketMarkets } from '@/lib/polymarket';
import { fetchKalshiMarkets } from '@/lib/kalshi';
import { NormalizedMarket } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Inline lightweight scoring so we can expose the breakdown
const STOP_WORDS = new Set([
  'will', 'the', 'a', 'an', 'be', 'is', 'are', 'was', 'were',
  'have', 'has', 'had', 'do', 'does', 'did', 'by', 'at', 'in',
  'on', 'to', 'of', 'for', 'with', 'above', 'below', 'end',
  'before', 'after', 'during', 'this', 'that', 'or', 'and',
  'not', 'no', 'yes', 'per', 'rate', 'more', 'than',
  'win', 'who', 'next', 'become', 'appointed',
]);

const TOKEN_SYNONYMS: Record<string, string> = {
  'btc': 'bitcoin', 'xbt': 'bitcoin', 'eth': 'ethereum',
  'sol': 'solana', 'doge': 'dogecoin', 'fomc': 'centralbank',
  'spx': 'spfivehundred', 'gop': 'republican',
  'democrat': 'democratic', 'dems': 'democratic',
  'usa': 'unitedstates', 'uk': 'unitedkingdom',
};

function canonicalCategory(raw: string): string {
  const c = (raw || '').toLowerCase();
  if (/sport|soccer|football|tennis|baseball|basketball|golf|hockey|cricket|rugby|world.?cup|mls|esport/.test(c)) return 'Sports';
  if (/crypto|bitcoin|ethereum|blockchain|defi/.test(c)) return 'Crypto';
  if (/elect|politi|geopolit|govern|democrat|republican|congress|senate/.test(c)) return 'Politics';
  if (/financ|econom|market|stock|equit|commodit|trade|gdp|inflation|bond/.test(c)) return 'Finance';
  if (/tech|science|ai|space|health|climat|weather/.test(c)) return 'Tech & Science';
  if (/cultur|entertainment|music|film|award/.test(c)) return 'Culture';
  return 'Other';
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t))
    .map(t => TOKEN_SYNONYMS[t] ?? t);
}

function getTrigrams(text: string): Set<string> {
  const s = new Set<string>();
  const p = `  ${text}  `;
  for (let i = 0; i < p.length - 2; i++) s.add(p.slice(i, i + 3));
  return s;
}

function trigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const tA = getTrigrams(a), tB = getTrigrams(b);
  let hit = 0;
  tA.forEach(t => { if (tB.has(t)) hit++; });
  return (2 * hit) / (tA.size + tB.size);
}

function extractNumbers(text: string): string[] {
  return (text.match(/\d+(\.\d+)?[km%]?/gi) || []).map(n => n.toLowerCase());
}

function rawOverlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b), setA = new Set(a);
  let matches = 0;
  setA.forEach(t => { if (setB.has(t)) matches++; });
  return matches / new Set([...setA, ...setB]).size;
}

function buildIdf(marketsA: NormalizedMarket[], marketsB: NormalizedMarket[]): Map<string, number> {
  const N = marketsA.length + marketsB.length;
  const df = new Map<string, number>();
  for (const m of [...marketsA, ...marketsB]) {
    for (const t of new Set(tokenize(m.normalizedQuestion))) {
      df.set(t, (df.get(t) ?? 0) + 1);
    }
  }
  const idf = new Map<string, number>();
  for (const [t, freq] of df) idf.set(t, Math.log((N + 1) / (freq + 1)));
  return idf;
}

function idfWeightedOverlap(tokA: string[], tokB: string[], idf: Map<string, number>): number {
  if (!tokA.length || !tokB.length) return 0;
  const setB = new Set(tokB);
  let hit = 0, total = 0;
  for (const t of tokA) {
    const w = idf.get(t) ?? 0;
    total += w;
    if (setB.has(t)) hit += w;
  }
  return total > 0 ? hit / total : 0;
}

interface ScoreBreakdown {
  total: number;
  trigram: number;
  idfFwd: number;
  idfBwd: number;
  idfMax: number;
  numOverlap: number;
  numPenalty: number;
  catMatch: boolean;
  catA: string;
  catB: string;
}

function scorePairDetailed(
  mA: NormalizedMarket, tokA: string[],
  mB: NormalizedMarket, tokB: string[],
  idf: Map<string, number>,
): ScoreBreakdown {
  const numsA = extractNumbers(mA.normalizedQuestion);
  const numsB = extractNumbers(mB.normalizedQuestion);
  const numOverlap = rawOverlap(numsA, numsB);
  const numPenalty = numsA.length > 0 && numsB.length > 0 && numOverlap < 0.3 ? 0.5 : 1.0;
  const trig = trigramSimilarity(mA.normalizedQuestion, mB.normalizedQuestion);
  const idfFwd = idfWeightedOverlap(tokA, tokB, idf);
  const idfBwd = idfWeightedOverlap(tokB, tokA, idf);
  const idfMax = Math.max(idfFwd, idfBwd);
  const catA = canonicalCategory(mA.category);
  const catB = canonicalCategory(mB.category);
  const catMatch = catA === catB && catA !== 'Other';
  const base = trig * 0.3 + idfMax * 0.6 + numOverlap * 0.1;
  const total = Math.min(1, base * numPenalty * (catMatch ? 1.15 : 1.0));
  return { total, trigram: trig, idfFwd, idfBwd, idfMax, numOverlap, numPenalty, catMatch, catA, catB };
}

function countBy<T>(arr: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of arr) {
    const k = key(item);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 20));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q       = searchParams.get('q')?.toLowerCase().trim() ?? '';
  const nearMode = searchParams.get('near') === '1';
  const catFilter = searchParams.get('cat') ?? '';
  const limit   = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);

  const [polyResult, kalshiResult] = await Promise.allSettled([
    fetchPolymarketMarkets(),
    fetchKalshiMarkets(),
  ]);

  const poly   = polyResult.status   === 'fulfilled' ? polyResult.value   : [];
  const kalshi = kalshiResult.status === 'fulfilled' ? kalshiResult.value : [];

  const polyCategories   = countBy(poly,   m => canonicalCategory(m.category));
  const kalshiCategories = countBy(kalshi, m => canonicalCategory(m.category));

  if (nearMode) {
    // Near-miss scan: find the best Kalshi match for each Polymarket market
    // that scores 0.45–0.64 (below the 0.65 threshold but genuinely close)
    const NEAR_LOW = 0.45, NEAR_HIGH = 0.64;
    const idf = buildIdf(poly, kalshi);
    const tokensK = kalshi.map(m => tokenize(m.normalizedQuestion));

    const nearMisses: Array<{
      poly: { question: string; normalizedQuestion: string; category: string; slug: string };
      kalshi: { question: string; normalizedQuestion: string; category: string; slug: string };
      score: ScoreBreakdown;
    }> = [];

    for (const pm of poly) {
      const tokP = tokenize(pm.normalizedQuestion);
      if (catFilter && canonicalCategory(pm.category) !== catFilter) continue;

      let best = { score: { total: 0 } as ScoreBreakdown, idx: -1 };
      for (let j = 0; j < kalshi.length; j++) {
        const s = scorePairDetailed(pm, tokP, kalshi[j], tokensK[j], idf);
        if (s.total > best.score.total) { best = { score: s, idx: j }; }
      }

      if (best.idx >= 0 && best.score.total >= NEAR_LOW && best.score.total <= NEAR_HIGH) {
        const km = kalshi[best.idx];
        nearMisses.push({
          poly:   { question: pm.question,   normalizedQuestion: pm.normalizedQuestion,   category: pm.category,   slug: pm.slug },
          kalshi: { question: km.question,   normalizedQuestion: km.normalizedQuestion,   category: km.category,   slug: km.slug },
          score: best.score,
        });
      }
    }

    nearMisses.sort((a, b) => b.score.total - a.score.total);

    return NextResponse.json({
      mode: 'near-misses',
      description: 'Pairs scoring 0.45–0.64 — below the 0.65 match threshold but plausible matches. Fix normalization or synonyms to push these over the line.',
      count: nearMisses.length,
      categoryFilter: catFilter || null,
      nearMisses: nearMisses.slice(0, limit),
      fetchedAt: new Date().toISOString(),
    });
  }

  // Keyword search mode
  if (q) {
    const polyMatches   = poly.filter(m =>
      m.question.toLowerCase().includes(q) || m.normalizedQuestion.includes(q) || m.slug.toLowerCase().includes(q)
    );
    const kalshiMatches = kalshi.filter(m =>
      m.question.toLowerCase().includes(q) || m.normalizedQuestion.includes(q) || m.slug.toLowerCase().includes(q)
    );

    const idf = buildIdf(poly, kalshi);
    const crossScores = polyMatches.slice(0, 10).map(pm => {
      const tokP = tokenize(pm.normalizedQuestion);
      let best = { score: { total: 0 } as ScoreBreakdown, idx: -1 };
      const allKalshiToks = kalshi.map(m => tokenize(m.normalizedQuestion));
      for (let j = 0; j < kalshi.length; j++) {
        const s = scorePairDetailed(pm, tokP, kalshi[j], allKalshiToks[j], idf);
        if (s.total > best.score.total) best = { score: s, idx: j };
      }
      return {
        poly: { question: pm.question, normalizedQuestion: pm.normalizedQuestion, slug: pm.slug, category: pm.category },
        bestKalshi: best.idx >= 0 ? {
          question: kalshi[best.idx].question,
          normalizedQuestion: kalshi[best.idx].normalizedQuestion,
          slug: kalshi[best.idx].slug,
          category: kalshi[best.idx].category,
        } : null,
        score: best.score,
      };
    });

    return NextResponse.json({
      mode: 'search',
      query: q,
      polymarket: { hits: polyMatches.length, results: polyMatches.slice(0, 15).map(m => ({ question: m.question, normalizedQuestion: m.normalizedQuestion, slug: m.slug, category: m.category, yesPrice: m.yesPrice })) },
      kalshi:     { hits: kalshiMatches.length, results: kalshiMatches.slice(0, 15).map(m => ({ question: m.question, normalizedQuestion: m.normalizedQuestion, slug: m.slug, category: m.category, yesPrice: m.yesPrice })) },
      crossScores,
      fetchedAt: new Date().toISOString(),
    });
  }

  // Default: overview mode
  return NextResponse.json({
    mode: 'overview',
    polymarket: {
      count: poly.length,
      error: polyResult.status === 'rejected' ? String((polyResult as PromiseRejectedResult).reason) : null,
      categories: polyCategories,
      sample: poly.slice(0, 5).map(m => ({ question: m.question, normalizedQuestion: m.normalizedQuestion, category: m.category, yesPrice: m.yesPrice, slug: m.slug })),
    },
    kalshi: {
      count: kalshi.length,
      error: kalshiResult.status === 'rejected' ? String((kalshiResult as PromiseRejectedResult).reason) : null,
      categories: kalshiCategories,
      sample: kalshi.slice(0, 5).map(m => ({ question: m.question, normalizedQuestion: m.normalizedQuestion, category: m.category, yesPrice: m.yesPrice, slug: m.slug })),
    },
    instructions: {
      search: 'Add ?q=bitcoin to search both platforms and see cross-scores',
      nearMisses: 'Add ?near=1 to see pairs that almost matched (score 0.45–0.64)',
      nearMissesByCat: 'Add ?near=1&cat=Sports to filter near-misses by category',
      limit: 'Add ?limit=100 to get more near-miss results (max 200)',
    },
    fetchedAt: new Date().toISOString(),
  });
}
