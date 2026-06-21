/**
 * Kalshi API client — uses RSA API key authentication (v2).
 *
 * SETUP:
 * 1. Go to kalshi.com → Settings → API Keys → Create Key
 * 2. Copy the Key ID (a UUID) → KALSHI_API_KEY_ID
 * 3. Download or copy the private key (.txt file) → KALSHI_PRIVATE_KEY
 *
 * In Vercel dashboard → Settings → Environment Variables:
 *   KALSHI_API_KEY_ID  = your-key-id-uuid
 *   KALSHI_PRIVATE_KEY = (paste the full contents of your .txt private key file)
 *
 * Without these, the app returns demo data so the UI is still visible.
 */

import { NormalizedMarket } from './types';
import { createSign, constants } from 'crypto';

const KALSHI_API = 'https://trading-api.kalshi.com/trade-api/v2';

function makeAuthHeaders(method: string, path: string): Record<string, string> {
  const keyId = process.env.KALSHI_API_KEY_ID ?? '';
  const rawKey = process.env.KALSHI_PRIVATE_KEY ?? '';
  // Vercel may store multiline values with literal \n — restore real newlines
  const privateKey = rawKey.replace(/\\n/g, '\n');

  const timestamp = Date.now().toString();
  const message = timestamp + method.toUpperCase() + path;

  const signer = createSign('SHA256');
  signer.update(message);
  signer.end();

  const signature = signer.sign(
    {
      key: privateKey,
      padding: constants.RSA_PKCS1_PSS_PADDING,
      saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
    },
    'base64',
  );

  return {
    'Content-Type': 'application/json',
    'KALSHI-ACCESS-KEY': keyId,
    'KALSHI-ACCESS-TIMESTAMP': timestamp,
    'KALSHI-ACCESS-SIGNATURE': signature,
  };
}

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
  const keyId = process.env.KALSHI_API_KEY_ID;
  const privateKey = process.env.KALSHI_PRIVATE_KEY;

  if (!keyId || !privateKey) {
    console.warn('[Kalshi] KALSHI_API_KEY_ID or KALSHI_PRIVATE_KEY not set — returning demo data.');
    return getDemoKalshiMarkets();
  }

  try {
    const path = '/trade-api/v2/markets';
    const res = await fetch(`${KALSHI_API}/markets?status=open&limit=100`, {
      headers: makeAuthHeaders('GET', path),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[Kalshi] API error ${res.status}: ${body}`);
      return getDemoKalshiMarkets();
    }

    const data: { markets: KalshiMarket[] } = await res.json();

    return data.markets
      .filter(m => m.status === 'open')
      .map((m): NormalizedMarket => {
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
  } catch (err) {
    console.error('[Kalshi] Request failed:', err instanceof Error ? err.message : err);
    return getDemoKalshiMarkets();
  }
}

// Realistic demo data (used when no API key is set)
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
