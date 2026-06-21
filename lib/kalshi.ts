/**
 * Kalshi API client
 * Kalshi requires an API key (email+password login) for most endpoints.
 * Set KALSHI_EMAIL and KALSHI_PASSWORD in .env.local to use real data.
 * Without credentials, this module returns realistic demo data so the
 * app works immediately and you can see what it will look like.
 *
 * To get credentials: sign up at https://kalshi.com
 * Then add to .env.local:
 *   KALSHI_EMAIL=your@email.com
 *   KALSHI_PASSWORD=yourpassword
 */

import { NormalizedMarket } from './types';

const KALSHI_API = 'https://trading-api.kalshi.com/trade-api/v2';

interface KalshiMarket {
  ticker: string;
  title: string;
  subtitle: string;
  category: string;
  yes_bid: number;  // in cents (0-100)
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  volume: number;
  liquidity: number;
  close_time: string;
  status: string;
}

interface KalshiAuthResponse {
  token: string;
  member_id: string;
}

let cachedToken: string | null = null;
let tokenExpiry: number = 0;

async function getKalshiToken(): Promise<string | null> {
  const email = process.env.KALSHI_EMAIL;
  const password = process.env.KALSHI_PASSWORD;
  if (!email || !password) return null;

  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const res = await fetch(`${KALSHI_API}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) return null;

  const data: KalshiAuthResponse = await res.json();
  cachedToken = data.token;
  tokenExpiry = Date.now() + 23 * 60 * 60 * 1000; // 23 hours
  return cachedToken;
}

export function normalizeKalshiQuestion(title: string, subtitle: string): string {
  const combined = subtitle ? `${title} ${subtitle}` : title;
  return combined
    .toLowerCase()
    .replace(/\?$/, '')
    .replace(/will\s+/g, '')
    .replace(/the\s+/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function fetchKalshiMarkets(): Promise<NormalizedMarket[]> {
  const token = await getKalshiToken();

  if (!token) {
    console.warn('[Kalshi] No credentials — returning demo data. Set KALSHI_EMAIL and KALSHI_PASSWORD in .env.local');
    return getDemoKalshiMarkets();
  }

  const res = await fetch(`${KALSHI_API}/markets?status=open&limit=100`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
    next: { revalidate: 30 },
  });

  if (!res.ok) {
    console.error(`[Kalshi] API error: ${res.status}`);
    return getDemoKalshiMarkets();
  }

  const data: { markets: KalshiMarket[] } = await res.json();

  return data.markets
    .filter(m => m.status === 'open')
    .map((m): NormalizedMarket => {
      // Kalshi prices are in cents (0-100), normalize to 0-1
      const yes = ((m.yes_bid + m.yes_ask) / 2) / 100;
      const no = ((m.no_bid + m.no_ask) / 2) / 100;
      return {
        id: m.ticker,
        platform: 'kalshi',
        question: m.subtitle ? `${m.title}: ${m.subtitle}` : m.title,
        normalizedQuestion: normalizeKalshiQuestion(m.title, m.subtitle),
        category: m.category || 'General',
        yesPrice: yes,
        noPrice: no,
        volume24h: m.volume ?? 0,
        liquidity: m.liquidity ?? 0,
        endDate: m.close_time,
        url: `https://kalshi.com/markets/${m.ticker}`,
        slug: m.ticker,
      };
    });
}

// Realistic demo data mirroring real Kalshi markets (used when no API key is set)
function getDemoKalshiMarkets(): NormalizedMarket[] {
  const demos: Array<Omit<NormalizedMarket, 'platform' | 'normalizedQuestion'> & { question: string }> = [
    {
      id: 'FED-26JUL',
      question: 'Fed rate cut in July 2026?',
      category: 'Economics',
      yesPrice: 0.38,
      noPrice: 0.63,
      volume24h: 1_800_000,
      liquidity: 620_000,
      endDate: '2026-07-30',
      url: 'https://kalshi.com/markets/FED-26JUL',
      slug: 'FED-26JUL',
    },
    {
      id: 'USGDP-26Q2',
      question: 'US GDP positive growth Q2 2026?',
      category: 'Economics',
      yesPrice: 0.67,
      noPrice: 0.34,
      volume24h: 940_000,
      liquidity: 380_000,
      endDate: '2026-07-30',
      url: 'https://kalshi.com/markets/USGDP-26Q2',
      slug: 'USGDP-26Q2',
    },
    {
      id: 'BTC-100K-JUL26',
      question: 'Bitcoin above $100,000 end of July 2026?',
      category: 'Crypto',
      yesPrice: 0.51,
      noPrice: 0.50,
      volume24h: 3_200_000,
      liquidity: 1_100_000,
      endDate: '2026-07-31',
      url: 'https://kalshi.com/markets/BTC-100K-JUL26',
      slug: 'BTC-100K-JUL26',
    },
    {
      id: 'UNEMP-JUN26',
      question: 'US unemployment below 4.5% in June 2026?',
      category: 'Economics',
      yesPrice: 0.74,
      noPrice: 0.27,
      volume24h: 610_000,
      liquidity: 210_000,
      endDate: '2026-07-02',
      url: 'https://kalshi.com/markets/UNEMP-JUN26',
      slug: 'UNEMP-JUN26',
    },
    {
      id: 'MIDTERMS-26-DEM',
      question: 'Democrats win House majority in 2026 midterms?',
      category: 'Politics',
      yesPrice: 0.44,
      noPrice: 0.57,
      volume24h: 2_400_000,
      liquidity: 890_000,
      endDate: '2026-11-04',
      url: 'https://kalshi.com/markets/MIDTERMS-26-DEM',
      slug: 'MIDTERMS-26-DEM',
    },
    {
      id: 'OIL-70-AUG26',
      question: 'Crude oil above $70 per barrel end of August 2026?',
      category: 'Commodities',
      yesPrice: 0.48,
      noPrice: 0.53,
      volume24h: 830_000,
      liquidity: 310_000,
      endDate: '2026-08-31',
      url: 'https://kalshi.com/markets/OIL-70-AUG26',
      slug: 'OIL-70-AUG26',
    },
  ];

  return demos.map(d => ({
    ...d,
    platform: 'kalshi' as const,
    normalizedQuestion: normalizeKalshiQuestion(d.question, ''),
  }));
}
