/**
 * Fuzzy market matcher — identifies the same real-world event across two platforms.
 *
 * Algorithm (three-layer):
 * 1. IDF weighting: tokens rare across the combined corpus (e.g. "Naftali", "Greenland")
 *    contribute far more to the score than common tokens ("2028", "democratic", "win").
 *    This eliminates the class of false positives where generic political keywords match
 *    structurally different questions.
 *
 * 2. Inverted index: instead of O(n×m) brute-force, each market is only scored against
 *    Kalshi markets that share at least one meaningful token. World Cup markets on
 *    Polymarket produce zero Kalshi candidates and are skipped instantly.
 *
 * 3. Trigram similarity: character-level overlap catches slight wording differences
 *    ("acquire Greenland" vs "buy Greenland") that word overlap misses.
 *
 * Final formula: 0.3×trigram + 0.6×IDF-weighted-overlap + 0.1×number-overlap
 * The IDF weight is doubled vs the old equal split because distinctive content words
 * carry the real signal.
 */

import { NormalizedMarket, MarketPair } from './types';

const MATCH_THRESHOLD = 0.65;

const STOP_WORDS = new Set([
  'will', 'the', 'a', 'an', 'be', 'is', 'are', 'was', 'were',
  'have', 'has', 'had', 'do', 'does', 'did', 'by', 'at', 'in',
  'on', 'to', 'of', 'for', 'with', 'above', 'below', 'end',
  'before', 'after', 'during', 'this', 'that', 'or', 'and',
  'not', 'no', 'yes', 'per', 'rate', 'more', 'than',
  'win', 'who', 'next', 'become', 'become', 'appointed',
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
  'usa':      'unitedstates',
  'uk':       'unitedkingdom',
};

// Map each platform's raw category string to a shared canonical label.
// Used for a scoring boost when both markets share the same topic domain.
function canonicalCategory(raw: string): string {
  const c = (raw || '').toLowerCase();
  if (/sport|soccer|football|tennis|baseball|basketball|golf|hockey|cricket|rugby|world.?cup|mls|esport/.test(c)) return 'Sports';
  if (/crypto|bitcoin|ethereum|blockchain|defi/.test(c)) return 'Crypto';
  if (/elect|politi|geopolit|govern|democrat|republican|congress|senate/.test(c)) return 'Politics';
  if (/financ|econom|market|stock|equit|commodit|trade|gdp|inflation|bond/.test(c)) return 'Finance';
  if (/tech|science|ai|space|health|climat|weather/.test(c)) return 'Tech';
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

// IDF-weighted overlap: tokens rare in the combined corpus get higher weight.
// Returns what fraction of marketA's IDF-weighted tokens also appear in marketB.
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

// Compute log(N / df) for each token across the combined corpus.
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
  // Smoothed IDF: log((N+1) / (df+1)) avoids divide-by-zero and keeps rare tokens finite
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

  // Heavy penalty when both sides have numbers that don't overlap
  // (e.g. "above $50k" vs "above $100k" should never match)
  const numPenalty = numsA.length > 0 && numsB.length > 0 && numOverlap < 0.3 ? 0.5 : 1.0;

  const trig = trigramSimilarity(qA, qB);

  // Use max(forward, backward) IDF overlap so short Kalshi outcome titles
  // ("Turkiye") still score well against long Polymarket questions.
  const idfFwd  = idfWeightedOverlap(tokA, tokB, idf);
  const idfBwd  = idfWeightedOverlap(tokB, tokA, idf);
  const idfOver = Math.max(idfFwd, idfBwd);

  // 30% trigram (wording similarity) + 60% IDF-weighted content overlap + 10% number match
  return Math.min(1, (trig * 0.3 + idfOver * 0.6 + numOverlap * 0.1) * numPenalty);
}

// Exported for unit tests / one-off scoring without a full corpus IDF.
export function scoreMarketMatch(a: NormalizedMarket, b: NormalizedMarket): number {
  const tokA = tokenize(a.normalizedQuestion);
  const tokB = tokenize(b.normalizedQuestion);
  // No IDF context — fall back to raw overlap (legacy behaviour)
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
  // --- Phase 1: build IDF from the combined corpus ---
  const idf = buildIdf(marketsA, marketsB);

  // --- Phase 2: precompute tokens (avoids re-tokenising in inner loop) ---
  const tokensA = marketsA.map(m => tokenize(m.normalizedQuestion));
  const tokensB = marketsB.map(m => tokenize(m.normalizedQuestion));

  // --- Phase 3: inverted index on marketsB (Kalshi) ---
  // Maps each token → list of Kalshi market indices that contain it.
  // This reduces O(n×m) to O(n × |candidates|) where candidates << m
  // for markets with distinctive tokens.
  const index = new Map<string, number[]>();
  for (let j = 0; j < marketsB.length; j++) {
    for (const t of tokensB[j]) {
      let list = index.get(t);
      if (!list) { list = []; index.set(t, list); }
      list.push(j);
    }
  }

  // --- Phase 4: score only candidate pairs ---
  const pairs: MarketPair[] = [];

  for (let i = 0; i < marketsA.length; i++) {
    const mA   = marketsA[i];
    const tokA = tokensA[i];

    // Collect unique Kalshi candidates sharing ≥1 token with this Polymarket market
    const candidates = new Set<number>();
    for (const t of tokA) {
      const list = index.get(t);
      if (list) for (const j of list) candidates.add(j);
    }

    let bestScore = MATCH_THRESHOLD;
    let bestIdx   = -1;

    const catA = canonicalCategory(mA.category);

    for (const j of candidates) {
      const base = scorePair(
        mA.normalizedQuestion, tokA,
        marketsB[j].normalizedQuestion, tokensB[j],
        idf,
      );
      // 15% boost when both markets share the same topic domain
      const catMatch = catA === canonicalCategory(marketsB[j].category) && catA !== 'Other';
      const s = Math.min(1, base * (catMatch ? 1.15 : 1.0));
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
