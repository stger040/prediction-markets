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

export function normalizePolymarketQuestion(q: string): string {
  return q
    .toLowerCase()
    .replace(/\?$/, '')
    .replace(/will\s+/g, '')
    .replace(/the\s+/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function fetchPolymarketMarkets(): Promise<NormalizedMarket[]> {
  const params = new URLSearchParams({
    active: 'true',
    closed: 'false',
    limit: '100',
    order: 'volume24hr',
    ascending: 'false',
  });

  const res = await fetch(`${GAMMA_API}/markets?${params}`, {
    headers: { 'Accept': 'application/json' },
    next: { revalidate: 30 },
  });

  if (!res.ok) throw new Error(`Polymarket API error: ${res.status}`);

  const data: PolymarketMarket[] = await res.json();

  return data
    .filter(m => m.active && !m.closed && m.outcomePrices && m.outcomes)
    .map((m): NormalizedMarket => {
      const { yes, no } = parsePrice(m.outcomePrices, m.outcomes);
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
      };
    });
}
