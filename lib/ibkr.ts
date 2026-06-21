/**
 * IBKR Client Portal API client — targets ForecastEx event contracts.
 *
 * HOW IT WORKS:
 * Interactive Brokers gives access to ForecastEx (their own event contract exchange)
 * AND to Kalshi contracts — all through a single IBKR account. Our arbitrage
 * compares IBKR ForecastEx prices against standalone Kalshi prices.
 *
 * SETUP REQUIRED (for real data):
 * 1. Download IB Gateway from https://www.interactivebrokers.com/en/trading/ibgateway.php
 * 2. Log in to IB Gateway with your IBKR credentials
 * 3. In IB Gateway settings: API → Settings → check "Enable Client Portal API", port 5000
 * 4. Add to .env.local:  IBKR_HOST=http://localhost:5000
 *
 * Without these steps, the app returns realistic demo data so you can see the UI.
 *
 * IMPORTANT IBKR EVENT CONTRACT RULES (from IBKR docs):
 * - ForecastEx contracts cannot be shorted — buy YES or buy NO as separate contracts
 * - Only Limit orders are supported (no Market orders)
 * - Use IOC (Immediate-or-Cancel) time-in-force for arb execution
 * - Contracts are identified by conid (integer), not tickers
 */

import { NormalizedMarket } from './types';

const IBKR_HOST = process.env.IBKR_HOST ?? '';

// ForecastEx contract search keywords — covers the same events Kalshi lists
const SEARCH_KEYWORDS = [
  'Federal Reserve', 'FOMC', 'interest rate',
  'unemployment', 'CPI', 'inflation',
  'GDP', 'recession',
  'Bitcoin', 'S&P 500',
  'election', 'president',
];

interface IBKRContractResult {
  conid: number;
  symbol: string;
  companyName: string; // for event contracts this IS the market question
  exchange: string;
  currency: string;
  secType: string;
}

interface IBKRMarketDataSnapshot {
  conid: number;
  '84': string;  // bid
  '86': string;  // ask
  '31': string;  // last price
  '7295': string; // close
}

// YES and NO contracts on ForecastEx are separate conids that IBKR links together.
// We represent a paired contract as a single market entry.
interface ForecastExPair {
  question: string;
  yesConid: number;
  noConid: number;
  yesBid: number;
  yesAsk: number;
  noBid: number;
  noAsk: number;
  endDate: string;
  category: string;
}

async function ibkrFetch(path: string, options?: RequestInit): Promise<Response> {
  // IB Gateway uses a self-signed cert; in Node.js we need to ignore it for localhost
  return fetch(`${IBKR_HOST}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    // 5s timeout — if gateway is not running, fail fast
    signal: AbortSignal.timeout(5000),
  });
}

async function searchContracts(keyword: string): Promise<IBKRContractResult[]> {
  const res = await ibkrFetch('/v1/api/iserver/secdef/search', {
    method: 'POST',
    body: JSON.stringify({ symbol: keyword, secType: '', name: true, isNameSearch: true }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  // Filter for ForecastEx contracts only
  return (data as IBKRContractResult[]).filter(
    c => c.exchange === 'FORECASTX' || c.exchange === 'ForecastEx'
  );
}

async function getMarketData(conids: number[]): Promise<Map<number, IBKRMarketDataSnapshot>> {
  const fields = '84,86,31,7295'; // bid, ask, last, close
  const res = await ibkrFetch(
    `/v1/api/iserver/marketdata/snapshot?conids=${conids.join(',')}&fields=${fields}`
  );
  if (!res.ok) return new Map();
  const data: IBKRMarketDataSnapshot[] = await res.json();
  return new Map(data.map(d => [d.conid, d]));
}

function normalizeIBKRQuestion(name: string): string {
  return name
    .toLowerCase()
    .replace(/\?$/, '')
    .replace(/will\s+/g, '')
    .replace(/the\s+/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function fetchIBKRMarkets(): Promise<NormalizedMarket[]> {
  if (!IBKR_HOST) {
    console.warn('[IBKR] No IBKR_HOST set — returning demo data. See lib/ibkr.ts for setup instructions.');
    return getDemoIBKRMarkets();
  }

  try {
    // Verify gateway is reachable and authenticated
    const authRes = await ibkrFetch('/v1/api/iserver/auth/status');
    if (!authRes.ok) {
      console.error('[IBKR] Gateway not authenticated. Open IB Gateway and log in.');
      return getDemoIBKRMarkets();
    }
    const authData = await authRes.json();
    if (!authData.authenticated) {
      console.error('[IBKR] IB Gateway is running but not logged in. Open the IB Gateway desktop app and log in.');
      return getDemoIBKRMarkets();
    }

    // Discover ForecastEx contracts across all keyword categories
    const allContracts: IBKRContractResult[] = [];
    const seen = new Set<number>();

    for (const keyword of SEARCH_KEYWORDS) {
      const results = await searchContracts(keyword);
      for (const c of results) {
        if (!seen.has(c.conid)) {
          seen.add(c.conid);
          allContracts.push(c);
        }
      }
    }

    if (allContracts.length === 0) {
      console.warn('[IBKR] No ForecastEx contracts found. Returning demo data.');
      return getDemoIBKRMarkets();
    }

    // Fetch market data for all found conids
    const conids = allContracts.map(c => c.conid);
    const marketData = await getMarketData(conids);

    return allContracts.map((contract): NormalizedMarket => {
      const data = marketData.get(contract.conid);
      const bid = data ? parseFloat(data['84']) / 100 : 0.5;
      const ask = data ? parseFloat(data['86']) / 100 : 0.5;
      const yesPrice = (bid + ask) / 2; // mid-price
      const noPrice = 1 - yesPrice;

      return {
        id: String(contract.conid),
        platform: 'ibkr',
        question: contract.companyName,
        normalizedQuestion: normalizeIBKRQuestion(contract.companyName),
        category: inferCategory(contract.companyName),
        yesPrice,
        noPrice,
        volume24h: 0, // IBKR snapshot doesn't include volume in same call
        liquidity: 0,
        endDate: '',
        url: `https://www.interactivebrokers.com/en/trading/forecastex.php`,
        slug: String(contract.conid),
      };
    });
  } catch (err) {
    console.error('[IBKR] Connection error:', err instanceof Error ? err.message : err);
    return getDemoIBKRMarkets();
  }
}

function inferCategory(question: string): string {
  const q = question.toLowerCase();
  if (q.includes('fed') || q.includes('fomc') || q.includes('rate') || q.includes('gdp') || q.includes('cpi') || q.includes('unemployment')) return 'Economics';
  if (q.includes('bitcoin') || q.includes('crypto') || q.includes('eth')) return 'Crypto';
  if (q.includes('election') || q.includes('president') || q.includes('senate') || q.includes('congress')) return 'Politics';
  if (q.includes('s&p') || q.includes('nasdaq') || q.includes('dow') || q.includes('stock')) return 'Markets';
  return 'General';
}

// Demo data: mirrors the same events as Kalshi demo data but with slightly
// different prices — this creates realistic arb opportunities to see in the UI.
function getDemoIBKRMarkets(): NormalizedMarket[] {
  const demos = [
    {
      id: 'FXFOMC26JUL',
      question: 'Federal Reserve rate cut — July 2026 FOMC meeting?',
      category: 'Economics',
      // Kalshi YES=0.38 — IBKR slightly different at 0.35 → arb on NO side
      yesPrice: 0.35,
      noPrice: 0.66,
      endDate: '2026-07-30',
    },
    {
      id: 'FXGDP26Q2',
      question: 'US GDP growth positive in Q2 2026?',
      category: 'Economics',
      // Kalshi YES=0.67 — IBKR YES=0.64 → buy IBKR YES + Kalshi NO(0.34) = 0.98 → 2% arb
      yesPrice: 0.64,
      noPrice: 0.37,
      endDate: '2026-07-30',
    },
    {
      id: 'FXBTC100K',
      question: 'Will Bitcoin close above $100,000 end of July 2026?',
      category: 'Crypto',
      // Kalshi YES=0.51 — IBKR YES=0.48 → buy IBKR YES + Kalshi NO(0.50) = 0.98 → 2% arb
      yesPrice: 0.48,
      noPrice: 0.53,
      endDate: '2026-07-31',
    },
    {
      id: 'FXUNEMP26',
      question: 'US unemployment rate stays below 4.5% — June 2026 report?',
      category: 'Economics',
      yesPrice: 0.72,
      noPrice: 0.29,
      endDate: '2026-07-02',
    },
    {
      id: 'FXOIL7026',
      question: 'WTI Crude Oil price above $70/barrel end of August 2026?',
      category: 'Commodities',
      // Kalshi YES=0.48 — IBKR YES=0.45 → buy IBKR YES + Kalshi NO(0.53) = 0.98 → 2% arb
      yesPrice: 0.45,
      noPrice: 0.56,
      endDate: '2026-08-31',
    },
    {
      id: 'FXMIDTERMS26',
      question: 'Democrats win House majority in 2026 midterm elections?',
      category: 'Politics',
      // Kalshi YES=0.44 — IBKR YES=0.41 → buy IBKR YES + Kalshi NO(0.57) = 0.98 → 2% arb
      yesPrice: 0.41,
      noPrice: 0.60,
      endDate: '2026-11-04',
    },
  ];

  return demos.map(d => ({
    ...d,
    platform: 'ibkr' as const,
    volume24h: 0,
    liquidity: 0,
    url: 'https://www.interactivebrokers.com/en/trading/forecastex.php',
    slug: d.id,
    normalizedQuestion: normalizeIBKRQuestion(d.question),
  }));
}
