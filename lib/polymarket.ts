/**
 * Polymarket API client
 * Public API — no authentication required for read-only market data.
 * Docs: https://docs.polymarket.com
 */

import { NormalizedMarket } from './types';

const GAMMA_API = 'https://gamma-api.polymarket.com';

interface PolymarketMarket {
  id: string;
  question: string;
  slug: string;
  endDate: string;
  category: string;
  volume: number;
  liquidity: number;
  active: boolean;
  closed: boolean;
  outcomePrices: string;   // JSON array e.g. '["0.65","0.35"]'
  outcomes: string;         // JSON array e.g. '["Yes","No"]'
  url: string;
  conditionId?: string;
  clobTokenIds?: string;   // JSON array e.g. '["12345","67890"]'
}

function parsePrice(outcomePrices: string, outcomes: string): { yes: number; no: number } {
  try {
    const prices: string[] = JSON.parse(outcomePrices);
    const outcomeList: string[] = JSON.parse(outcomes);
    const yesIdx = outcomeList.findIndex(o => o.toLowerCase() === 'yes');
    const noIdx = outcomeList.findIndex(o => o.toLowerCase() === 'no');
    const yes = yesIdx >= 0 ? parseFloat(prices[yesIdx]) : parseFloat(prices[0]);
    const no = noIdx >= 0 ? parseFloat(prices[noIdx]) : parseFloat(prices[1]);
    return { yes: yes || 0, no: no || 0 };
  } catch {
    return { yes: 0, no: 0 };
  }
}

function expandPhrases(text: string): string {
  return text
    .replace(/federal\s+reserve/gi, 'centralbank')
    .replace(/\bfomc\b/gi, 'centralbank')
    .replace(/\bfed\b(?=\s+rate|\s+cut|\s+hike|\s+pause|\s+pivot|\s+meeting|\s+decision)/gi, 'centralbank')
    .replace(/s&p\s*500/gi, 'spfivehundred')
    .replace(/\bspx\b/gi, 'spfivehundred')
    .replace(/artificial\s+intelligence/gi, 'artificialintelligence')
    .replace(/united\s+states/gi, 'unitedstates')
    .replace(/\bu\.s\.a\.?\b/gi, 'unitedstates')
    .replace(/\busa\b/gi, 'unitedstates')
    .replace(/united\s+kingdom/gi, 'unitedkingdom')
    .replace(/\bu\.k\.?\b/gi, 'unitedkingdom')
    .replace(/\buk\b/gi, 'unitedkingdom')
    .replace(/european\s+union/gi, 'europeanunion')
    .replace(/\bgop\b/gi, 'republican')
    .replace(/\bbtc\b/gi, 'bitcoin')
    .replace(/\bxbt\b/gi, 'bitcoin')
    .replace(/\beth\b/gi, 'ethereum')
    .replace(/\bsol\b(?=\s|$)/gi, 'solana')
    .replace(/\bdoge\b/gi, 'dogecoin');
}

export function normalizePolymarketQuestion(q: string): string {
  return expandPhrases(q)
    .toLowerCase()
    // Strip combining diacritics so "Türkiye" → "Turkiye", "Hernández" → "Hernandez"
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\?$/, '')
    .replace(/will\s+/g, '')
    .replace(/the\s+/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchPage(offset: number): Promise<PolymarketMarket[]> {
  const params = new URLSearchParams({
    active: 'true',
    closed: 'false',
    limit: '100',
    offset: String(offset),
    order: 'volume24hr',
    ascending: 'false',
  });

  try {
    const res = await fetch(`${GAMMA_API}/markets?${params}`, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 30 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function normalizeMarket(m: PolymarketMarket): NormalizedMarket {
  const { yes, no } = parsePrice(m.outcomePrices, m.outcomes);

  let clobTokenIds: [string, string] | undefined;
  if (m.clobTokenIds) {
    try {
      const ids: string[] = JSON.parse(m.clobTokenIds);
      if (ids.length >= 2) clobTokenIds = [ids[0], ids[1]];
    } catch { /* ignore */ }
  }

  return {
    id: m.id,
    platform: 'polymarket',
    question: m.question,
    normalizedQuestion: normalizePolymarketQuestion(m.question),
    category: m.category || 'General',
    yesPrice: yes,
    noPrice: no,
    volume24h: m.volume ?? 0,
    liquidity: m.liquidity ?? 0,
    endDate: m.endDate,
    url: `https://polymarket.com/event/${m.slug}`,
    slug: m.slug,
    conditionId: m.conditionId,
    clobTokenIds,
  };
}

export async function fetchPolymarketMarkets(): Promise<NormalizedMarket[]> {
  // Gamma API caps at 100 per request — fetch 12 pages in parallel to reach ~1200 markets.
  // Top 100 by volume are often dominated by a single event (e.g. World Cup 2026);
  // pages 2-12 expose the economics/politics/crypto markets that Kalshi also covers.
  const pages = await Promise.all(
    [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100].map(fetchPage)
  );
  const raw = pages.flat();

  // Deduplicate by id
  const seen = new Set<string>();
  const unique = raw.filter(m => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  console.log(`[Polymarket] Fetched ${unique.length} unique markets across ${pages.length} pages`);

  if (!unique.length) throw new Error('Polymarket API returned no markets');

  return unique
    .filter(m => m.active && !m.closed && m.outcomePrices && m.outcomes)
    .map(normalizeMarket);
}
