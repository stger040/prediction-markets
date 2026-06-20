/**
 * Fuzzy market matcher — finds the same event across Polymarket and Kalshi.
 *
 * Strategy:
 * 1. Extract key "signal words" (nouns, numbers, dates, tickers) from each question
 * 2. Score pairs by keyword overlap + trigram similarity
 * 3. Return pairs above a confidence threshold
 *
 * This is the "unified API" concept from the original idea — normalizing the
 * slight differences in how each platform words the same bet.
 */

import { NormalizedMarket, MarketPair } from './types';

// Minimum match score to consider two markets the same event (0-1)
const MATCH_THRESHOLD = 0.45;

// Words that carry no signal for matching
const STOP_WORDS = new Set([
  'will', 'the', 'a', 'an', 'be', 'is', 'are', 'was', 'were',
  'have', 'has', 'had', 'do', 'does', 'did', 'by', 'at', 'in',
  'on', 'to', 'of', 'for', 'with', 'above', 'below', 'end',
  'before', 'after', 'during', 'this', 'that', 'or', 'and',
  'not', 'no', 'yes', 'per', 'rate',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
}

function getTrigrams(text: string): Set<string> {
  const trigrams = new Set<string>();
  const padded = `  ${text}  `;
  for (let i = 0; i < padded.length - 2; i++) {
    trigrams.add(padded.slice(i, i + 3));
  }
  return trigrams;
}

function trigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const tA = getTrigrams(a);
  const tB = getTrigrams(b);
  let intersection = 0;
  tA.forEach(t => { if (tB.has(t)) intersection++; });
  return (2 * intersection) / (tA.size + tB.size);
}

function keywordOverlap(tokensA: string[], tokensB: string[]): number {
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let matches = 0;
  setA.forEach(t => { if (setB.has(t)) matches++; });
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : matches / union;
}

// Numbers and year references carry strong signal — boost them
function extractSignalNumbers(text: string): string[] {
  return (text.match(/\d+(\.\d+)?[km%]?/gi) || []).map(n => n.toLowerCase());
}

export function scoreMarketMatch(a: NormalizedMarket, b: NormalizedMarket): number {
  const qA = a.normalizedQuestion;
  const qB = b.normalizedQuestion;

  const tokA = tokenize(qA);
  const tokB = tokenize(qB);
  const numsA = extractSignalNumbers(qA);
  const numsB = extractSignalNumbers(qB);

  const trig = trigramSimilarity(qA, qB);
  const overlap = keywordOverlap(tokA, tokB);
  const numOverlap = keywordOverlap(numsA, numsB);

  // If one question contains a specific number the other doesn't, they're probably different events
  const numPenalty = numsA.length > 0 && numsB.length > 0 && numOverlap < 0.3 ? 0.5 : 1.0;

  const raw = (trig * 0.5 + overlap * 0.4 + numOverlap * 0.1) * numPenalty;
  return Math.min(1, raw);
}

export function findMarketPairs(
  polyMarkets: NormalizedMarket[],
  kalshiMarkets: NormalizedMarket[],
): MarketPair[] {
  const pairs: MarketPair[] = [];

  for (const poly of polyMarkets) {
    let bestScore = MATCH_THRESHOLD;
    let bestKalshi: NormalizedMarket | null = null;

    for (const kalshi of kalshiMarkets) {
      const score = scoreMarketMatch(poly, kalshi);
      if (score > bestScore) {
        bestScore = score;
        bestKalshi = kalshi;
      }
    }

    if (bestKalshi) {
      pairs.push({ polymarket: poly, kalshi: bestKalshi, matchScore: bestScore });
    }
  }

  // Sort by match confidence descending
  return pairs.sort((a, b) => b.matchScore - a.matchScore);
}
