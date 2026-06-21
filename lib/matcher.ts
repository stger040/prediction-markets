/**
 * Fuzzy market matcher — identifies the same real-world event across two platforms.
 *
 * Strategy:
 * 1. Extract "signal" tokens (numbers, tickers, key nouns) from each question
 * 2. Score pairs by trigram similarity + keyword overlap
 * 3. Numbers carry strong signal — mismatched numbers penalize the score heavily
 * 4. Return the best match per marketA above the confidence threshold
 */

import { NormalizedMarket, MarketPair } from './types';

const MATCH_THRESHOLD = 0.65;

const STOP_WORDS = new Set([
  'will', 'the', 'a', 'an', 'be', 'is', 'are', 'was', 'were',
  'have', 'has', 'had', 'do', 'does', 'did', 'by', 'at', 'in',
  'on', 'to', 'of', 'for', 'with', 'above', 'below', 'end',
  'before', 'after', 'during', 'this', 'that', 'or', 'and',
  'not', 'no', 'yes', 'per', 'rate', 'more', 'than',
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

function extractNumbers(text: string): string[] {
  return (text.match(/\d+(\.\d+)?[km%]?/gi) || []).map(n => n.toLowerCase());
}

export function scoreMarketMatch(a: NormalizedMarket, b: NormalizedMarket): number {
  const qA = a.normalizedQuestion;
  const qB = b.normalizedQuestion;

  const tokA = tokenize(qA);
  const tokB = tokenize(qB);
  const numsA = extractNumbers(qA);
  const numsB = extractNumbers(qB);

  const trig = trigramSimilarity(qA, qB);
  const overlap = keywordOverlap(tokA, tokB);
  const numOverlap = keywordOverlap(numsA, numsB);

  // If both questions have numbers but they don't match, heavily penalize
  const numPenalty = numsA.length > 0 && numsB.length > 0 && numOverlap < 0.3 ? 0.5 : 1.0;

  const raw = (trig * 0.5 + overlap * 0.4 + numOverlap * 0.1) * numPenalty;
  return Math.min(1, raw);
}

export function findMarketPairs(
  marketsA: NormalizedMarket[],
  marketsB: NormalizedMarket[],
): MarketPair[] {
  const pairs: MarketPair[] = [];

  for (const mA of marketsA) {
    let bestScore = MATCH_THRESHOLD;
    let bestB: NormalizedMarket | null = null;

    for (const mB of marketsB) {
      const score = scoreMarketMatch(mA, mB);
      if (score > bestScore) {
        bestScore = score;
        bestB = mB;
      }
    }

    if (bestB) {
      pairs.push({ marketA: mA, marketB: bestB, matchScore: bestScore });
    }
  }

  return pairs.sort((a, b) => b.matchScore - a.matchScore);
}
