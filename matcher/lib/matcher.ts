import { NormalizedMarket, MarketPair } from './types';

const MATCH_THRESHOLD = 0.65;

const STOP_WORDS = new Set([
  'will', 'the', 'a', 'an', 'be', 'is', 'are', 'was', 'were',
  'have', 'has', 'had', 'do', 'does', 'did', 'by', 'at', 'in',
  'on', 'to', 'of', 'for', 'with', 'above', 'below', 'end',
  'before', 'after', 'during', 'this', 'that', 'or', 'and',
  'not', 'no', 'yes', 'per', 'rate', 'more', 'than',
  'win', 'who', 'next', 'become', 'appointed',
]);

const TOKEN_SYNONYMS: Record<string, string> = {
  'btc':      'bitcoin',
  'xbt':      'bitcoin',
  'eth':      'ethereum',
  'sol':      'solana',
  'doge':     'dogecoin',
  'fomc':     'centralbank',
  'spx':      'spfivehundred',
  'gop':      'republican',
  'democrat': 'democratic',
  'dems':     'democratic',
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t))
    .map(t => TOKEN_SYNONYMS[t] ?? t);
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

function extractNumbers(text: string): string[] {
  return (text.match(/\d+(\.\d+)?[km%]?/gi) || []).map(n => n.toLowerCase());
}

function rawOverlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  let matches = 0;
  const setA = new Set(a);
  setA.forEach(t => { if (setB.has(t)) matches++; });
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : matches / union;
}

function idfWeightedOverlap(
  tokA: string[],
  tokB: string[],
  idf: Map<string, number>,
): number {
  if (!tokA.length || !tokB.length) return 0;
  const setB = new Set(tokB);
  let hitWeight = 0;
  let totalWeight = 0;
  for (const t of tokA) {
    const w = idf.get(t) ?? 0;
    totalWeight += w;
    if (setB.has(t)) hitWeight += w;
  }
  return totalWeight > 0 ? hitWeight / totalWeight : 0;
}

function buildIdf(
  marketsA: NormalizedMarket[],
  marketsB: NormalizedMarket[],
): Map<string, number> {
  const N = marketsA.length + marketsB.length;
  const df = new Map<string, number>();
  for (const m of [...marketsA, ...marketsB]) {
    for (const t of new Set(tokenize(m.normalizedQuestion))) {
      df.set(t, (df.get(t) ?? 0) + 1);
    }
  }
  const idf = new Map<string, number>();
  for (const [t, freq] of df) {
    idf.set(t, Math.log((N + 1) / (freq + 1)));
  }
  return idf;
}

function scorePair(
  qA: string, tokA: string[],
  qB: string, tokB: string[],
  idf: Map<string, number>,
): number {
  const numsA = extractNumbers(qA);
  const numsB = extractNumbers(qB);
  const numOverlap = rawOverlap(numsA, numsB);
  const numPenalty = numsA.length > 0 && numsB.length > 0 && numOverlap < 0.3 ? 0.5 : 1.0;
  const trig    = trigramSimilarity(qA, qB);
  const idfOver = idfWeightedOverlap(tokA, tokB, idf);
  return Math.min(1, (trig * 0.3 + idfOver * 0.6 + numOverlap * 0.1) * numPenalty);
}

export function scoreMarketMatch(a: NormalizedMarket, b: NormalizedMarket): number {
  const tokA = tokenize(a.normalizedQuestion);
  const tokB = tokenize(b.normalizedQuestion);
  const overlap = rawOverlap(tokA, tokB);
  const numsA   = extractNumbers(a.normalizedQuestion);
  const numsB   = extractNumbers(b.normalizedQuestion);
  const numOver = rawOverlap(numsA, numsB);
  const numPenalty = numsA.length > 0 && numsB.length > 0 && numOver < 0.3 ? 0.5 : 1.0;
  const trig    = trigramSimilarity(a.normalizedQuestion, b.normalizedQuestion);
  return Math.min(1, (trig * 0.3 + overlap * 0.6 + numOver * 0.1) * numPenalty);
}

export function findMarketPairs(
  marketsA: NormalizedMarket[],
  marketsB: NormalizedMarket[],
): MarketPair[] {
  const idf = buildIdf(marketsA, marketsB);

  const tokensA = marketsA.map(m => tokenize(m.normalizedQuestion));
  const tokensB = marketsB.map(m => tokenize(m.normalizedQuestion));

  const index = new Map<string, number[]>();
  for (let j = 0; j < marketsB.length; j++) {
    for (const t of tokensB[j]) {
      let list = index.get(t);
      if (!list) { list = []; index.set(t, list); }
      list.push(j);
    }
  }

  const pairs: MarketPair[] = [];

  for (let i = 0; i < marketsA.length; i++) {
    const mA   = marketsA[i];
    const tokA = tokensA[i];

    const candidates = new Set<number>();
    for (const t of tokA) {
      const list = index.get(t);
      if (list) for (const j of list) candidates.add(j);
    }

    let bestScore = MATCH_THRESHOLD;
    let bestIdx   = -1;

    for (const j of candidates) {
      const s = scorePair(
        mA.normalizedQuestion, tokA,
        marketsB[j].normalizedQuestion, tokensB[j],
        idf,
      );
      if (s > bestScore) {
        bestScore = s;
        bestIdx   = j;
      }
    }

    if (bestIdx >= 0) {
      pairs.push({ marketA: mA, marketB: marketsB[bestIdx], matchScore: bestScore });
    }
  }

  return pairs.sort((a, b) => b.matchScore - a.matchScore);
}
