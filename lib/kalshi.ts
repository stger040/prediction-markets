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
      id: 'FED-25JUL',
      question: 'Fed rate cut in July 2025?',
      category: 'Economics',
      yesPrice: 0.62,
      noPrice: 0.39,
      volume24h: 1_200_000,
      liquidity: 450_000,
      endDate: '2025-07-31',
      url: 'https://kalshi.com/markets/FED-25JUL',
      slug: 'FED-25JUL',
    },
    {
      id: 'USGDP-25Q2',
      question: 'US GDP positive growth Q2 2025?',
      category: 'Economics',
      yesPrice: 0.71,
      noPrice: 0.30,
      volume24h: 890_000,
      liquidity: 310_000,
      endDate: '2025-07-30',
      url: 'https://kalshi.com/markets/USGDP-25Q2',
      slug: 'USGDP-25Q2',
    },
    {
      id: 'BTC-60K-JUN',
      question: 'Bitcoin above $60,000 end of June 2025?',
      category: 'Crypto',
      yesPrice: 0.44,
      noPrice: 0.58,
      volume24h: 2_100_000,
      liquidity: 980_000,
      endDate: '2025-06-30',
      url: 'https://kalshi.com/markets/BTC-60K-JUN',
      slug: 'BTC-60K-JUN',
    },
    {
      id: 'UNEMP-MAY25',
      question: 'US unemployment below 4.5% in May 2025?',
      category: 'Economics',
      yesPrice: 0.81,
      noPrice: 0.20,
      volume24h: 540_000,
      liquidity: 190_000,
      endDate: '2025-06-07',
      url: 'https://kalshi.com/markets/UNEMP-MAY25',
      slug: 'UNEMP-MAY25',
    },
    {
      id: 'AI-GPT5-2025',
      question: 'OpenAI release GPT-5 in 2025?',
      category: 'Technology',
      yesPrice: 0.68,
      noPrice: 0.33,
      volume24h: 670_000,
      liquidity: 230_000,
      endDate: '2025-12-31',
      url: 'https://kalshi.com/markets/AI-GPT5-2025',
      slug: 'AI-GPT5-2025',
    },
    {
      id: 'OIL-70-JUL',
      question: 'Crude oil above $70 per barrel in July 2025?',
      category: 'Commodities',
      yesPrice: 0.53,
      noPrice: 0.49,
      volume24h: 780_000,
      liquidity: 290_000,
      endDate: '2025-07-31',
      url: 'https://kalshi.com/markets/OIL-70-JUL',
      slug: 'OIL-70-JUL',
    },
  ];

  return demos.map(d => ({
    ...d,
    platform: 'kalshi' as const,
    normalizedQuestion: normalizeKalshiQuestion(d.question, ''),
  }));
}
