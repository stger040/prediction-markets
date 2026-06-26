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
  'usa':      'unitedstates',
  'uk':       'unitedkingdom',
};

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

function jaro(s: string, t: string): number {
  if (s === t) return 1;
  const sLen = s.length;
  const tLen = t.length;
  if (sLen === 0 || tLen === 0) return 0;
  const matchWindow = Math.floor(Math.max(sLen, tLen) / 2) - 1;
  if (matchWindow < 0) return 0;
  const sMatches = new Array<boolean>(sLen).fill(false);
  const tMatches = new Array<boolean>(tLen).fill(false);
  let matches = 0;
  for (let i = 0; i < sLen; i++) {
    const start = Math.max(0, i - matchWindow);
    const end   = Math.min(i + matchWindow + 1, tLen);
    for (let j = start; j < end; j++) {
      if (tMatches[j] || s[i] !== t[j]) continue;
      sMatches[i] = true;
      tMatches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < sLen; i++) {
    if (!sMatches[i]) continue;
    while (!tMatches[k]) k++;
    if (s[i] !== t[k]) transpositions++;
    k++;
  }
  return (matches / sLen + matches / tLen + (matches - transpositions / 2) / matches) / 3;
}

function jaroWinkler(s: string, t: string): number {
  const j = jaro(s, t);
  let prefix = 0;
  for (let i = 0; i < Math.min(4, s.length, t.length); i++) {
    if (s[i] === t[i]) prefix++;
    else break;
  }
  return j + prefix * 0.1 * (1 - j);
}

function dateSimilarity(dateA: string, dateB: string): number {
  if (!dateA || !dateB) return 0.5;
  const msA = Date.parse(dateA);
  const msB = Date.parse(dateB);
  if (isNaN(msA) || isNaN(msB)) return 0.5;
  const days = Math.abs(msA - msB) / 86_400_000;
  if (days <= 1)  return 1.0;
  if (days <= 7)  return 0.85;
  if (days <= 30) return 0.6;
  if (days <= 90) return 0.3;
  return 0.0;
}

function scorePair(
  mA: NormalizedMarket, tokA: string[],
  mB: NormalizedMarket, tokB: string[],
  idf: Map<string, number>,
): number {
  const qA = mA.normalizedQuestion;
  const qB = mB.normalizedQuestion;
  const numsA = extractNumbers(qA);
  const numsB = extractNumbers(qB);
  const numOverlap = rawOverlap(numsA, numsB);
  const numPenalty = numsA.length > 0 && numsB.length > 0 && numOverlap < 0.3 ? 0.5 : 1.0;
  const trig = trigramSimilarity(qA, qB);
  const jw   = jaroWinkler(qA, qB);
  const idfFwd  = idfWeightedOverlap(tokA, tokB, idf);
  const idfBwd  = idfWeightedOverlap(tokB, tokA, idf);
  const idfOver = Math.max(idfFwd, idfBwd);
  const textScore = (trig * 0.20 + idfOver * 0.60 + jw * 0.20) * numPenalty;
  const dateSim = dateSimilarity(mA.endDate, mB.endDate);
  return Math.min(1, textScore * 0.85 + dateSim * 0.15);
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
  const jw      = jaroWinkler(a.normalizedQuestion, b.normalizedQuestion);
  const dateSim = dateSimilarity(a.endDate, b.endDate);
  const textScore = (trig * 0.20 + overlap * 0.60 + jw * 0.20) * numPenalty;
  return Math.min(1, textScore * 0.85 + dateSim * 0.15);
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
    const catA    = canonicalCategory(mA.category);

    for (const j of candidates) {
      const base = scorePair(
        mA, tokA,
        marketsB[j], tokensB[j],
        idf,
      );
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
