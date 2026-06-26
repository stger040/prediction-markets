/**
 * Kalshi API client
 *
 * The /markets endpoint is public — no authentication required to read prices.
 * Auth (KALSHI_API_KEY_ID + KALSHI_PRIVATE_KEY) is only needed for private
 * endpoints like placing orders or viewing portfolio.
 *
 * Production base URL: https://external-api.kalshi.com/trade-api/v2
 *
 * Price fields use the post-fixed-point-migration format:
 *   yes_bid_dollars / yes_ask_dollars — string, e.g. "0.5600"
 */

import { NormalizedMarket } from './types';
import { createSign, constants } from 'crypto';

const KALSHI_BASE = 'https://external-api.kalshi.com';
const KALSHI_API  = `${KALSHI_BASE}/trade-api/v2`;

// Auth headers — only needed for portfolio/order endpoints, NOT for /markets.
// Signing follows the official Kalshi JS example exactly:
//   createSign('RSA-SHA256') + RSA_PKCS1_PSS_PADDING + RSA_PSS_SALTLEN_DIGEST
export function makeKalshiAuthHeaders(method: string, path: string): Record<string, string> {
  const keyId      = process.env.KALSHI_API_KEY_ID ?? '';
  const rawKey     = process.env.KALSHI_PRIVATE_KEY ?? '';
  // Vercel may store multiline values with literal \n — restore real newlines
  const privateKey = rawKey.replace(/\\n/g, '\n');

  const timestamp   = Date.now().toString();
  // Message = timestamp + METHOD + path_without_query
  // e.g. "1703123456789GET/trade-api/v2/portfolio/balance"
  const pathNoQuery = path.split('?')[0];
  const msgString   = timestamp + method.toUpperCase() + pathNoQuery;

  const signer = createSign('RSA-SHA256');
  signer.update(msgString);
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
  event_ticker?: string;
  title: string;
  subtitle?: string;
  yes_sub_title?: string;
  no_sub_title?: string;
  category?: string;
  status: string;
  close_time: string;
  // Fixed-point string price fields (current API)
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  no_bid_dollars?: string;
  no_ask_dollars?: string;
  volume_fp?: string;
  volume_24h_fp?: string;
  liquidity_dollars?: string;
  // Legacy integer cent fields (0–100), kept for safety
  yes_bid?: number;
  yes_ask?: number;
  no_bid?: number;
  no_ask?: number;
  volume?: number;
  volume_24h?: number;
  liquidity?: number;
}

function parsePrice(dollars?: string, cents?: number): number {
  if (dollars !== undefined && dollars !== '') return parseFloat(dollars);
  if (cents !== undefined) return cents / 100;
  return 0.5;
}

// Phrase-level synonym expansion — applied before char stripping so "S&P 500" still matches
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

export function normalizeKalshiQuestion(title: string, subtitle: string): string {
  const combined = subtitle ? `${title} ${subtitle}` : title;
  return expandPhrases(combined)
    .toLowerCase()
    // Strip combining diacritics so "Türkiye" → "Turkiye"
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\?$/, '')
    .replace(/will\s+/g, '')
    .replace(/the\s+/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// eventTitle: the parent event's title (e.g. "Turkiye vs USA") — critical for sports markets
// whose individual outcome titles ("Turkiye", "USA", "Tie") are too short to match alone.
// eventSubTitle: e.g. "World Soccer Cup Group Stage" — adds tournament context for richer matching
function normalizeKalshiMarket(m: KalshiMarket, eventTitle = '', eventCategory?: string, eventSubTitle = ''): NormalizedMarket {
  const subtitle = m.subtitle || m.yes_sub_title || '';
  // Display question: "Event: Outcome" when they differ
  const question = eventTitle && m.title !== eventTitle
    ? `${eventTitle}: ${m.title}${subtitle && subtitle !== m.title ? ' - ' + subtitle : ''}`
    : (subtitle && subtitle !== m.title ? `${m.title}: ${subtitle}` : m.title);

  const yes = parsePrice(
    m.yes_bid_dollars ?? m.yes_ask_dollars,
    m.yes_bid ?? m.yes_ask,
  );
  const no = parsePrice(
    m.no_bid_dollars ?? m.no_ask_dollars,
    m.no_bid ?? m.no_ask,
  );

  // Combine event sub_title + event title + market title + subtitle for maximum matching context
  const normalText = [eventSubTitle, eventTitle, m.title, subtitle]
    .filter(Boolean)
    .join(' ');

  return {
    id: m.ticker,
    platform: 'kalshi',
    question,
    normalizedQuestion: normalizeKalshiQuestion(normalText, ''),
    category: eventCategory || m.category || 'General',
    yesPrice: yes,
    noPrice: no,
    volume24h: (parseFloat(m.volume_24h_fp ?? '') || m.volume_24h) ?? m.volume ?? 0,
    liquidity: (parseFloat(m.liquidity_dollars ?? '') || m.liquidity) ?? 0,
    endDate: m.close_time,
    url: `https://kalshi.com/markets/${m.ticker}`,
    slug: m.ticker,
  };
}

interface KalshiEvent {
  event_ticker: string;
  title: string;
  sub_title?: string;
  category?: string;
  status: string;
  markets?: KalshiMarket[];
}

export async function fetchKalshiMarkets(): Promise<NormalizedMarket[]> {
  const allEvents: KalshiEvent[] = [];
  let cursor: string | undefined;
  let page = 0;
  const MAX_PAGES = 15; // safety cap — ~3000 events max

  try {
    do {
      const url = new URL(`${KALSHI_API}/events`);
      url.searchParams.set('status', 'open');
      url.searchParams.set('limit', '200');
      url.searchParams.set('with_nested_markets', 'true');
      if (cursor) url.searchParams.set('cursor', cursor);

      const res = await fetch(url.toString(), {
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error(`[Kalshi] Events API error ${res.status}: ${body.slice(0, 200)}`);
        break;
      }

      const data: { events?: KalshiEvent[]; cursor?: string } = await res.json();
      const batch = data.events ?? [];
      allEvents.push(...batch);
      cursor = data.cursor || undefined;
      page++;
      console.log(`[Kalshi] Page ${page}: ${batch.length} events (cursor: ${cursor ? 'yes' : 'done'})`);
    } while (cursor && page < MAX_PAGES);

    console.log(`[Kalshi] Total fetched: ${allEvents.length} events across ${page} page(s)`);

    if (!allEvents.length) {
      console.warn('[Kalshi] No events returned — using demo data');
      return getDemoKalshiMarkets();
    }

    const markets: NormalizedMarket[] = [];
    for (const event of allEvents) {
      if (event.event_ticker?.toUpperCase().startsWith('KXMV')) continue;
      if (event.status === 'settled' || event.status === 'determined' || event.status === 'closed') continue;
      for (const m of event.markets ?? []) {
        markets.push(normalizeKalshiMarket(m, event.title, event.category, event.sub_title));
      }
    }

    console.log(`[Kalshi] ${markets.length} markets from ${allEvents.length} events (after KXMV filter)`);
    return markets.length ? markets : getDemoKalshiMarkets();
  } catch (err) {
    console.error('[Kalshi] Request failed:', err instanceof Error ? err.message : err);
    return getDemoKalshiMarkets();
  }
}

export interface KalshiOrderParams {
  ticker: string;
  side: 'yes' | 'no';
  contracts: number;       // integer, 1 contract = 1 share
  priceCents: number;      // 0-100, e.g. 45 = $0.45/share
  clientOrderId?: string;
}

export interface KalshiOrderResult {
  orderId: string;
  status: string;
}

export async function placeKalshiOrder(params: KalshiOrderParams): Promise<KalshiOrderResult> {
  const path = '/trade-api/v2/portfolio/orders';
  const headers = makeKalshiAuthHeaders('POST', path);

  // Kalshi v2 uses yes_price_cents / no_price_cents (integer 0-100), not a generic "price" field.
  // The exchange is single-book (YES-perspective), so only send the price for the side being bought.
  const body: Record<string, unknown> = {
    ticker:          params.ticker,
    action:          'buy',
    type:            'limit',
    side:            params.side,
    count:           params.contracts,
    time_in_force:   'good_till_canceled',
    client_order_id: params.clientOrderId ?? `arb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  };
  if (params.side === 'yes') {
    body.yes_price_cents = params.priceCents;
  } else {
    body.no_price_cents = params.priceCents;
  }

  const res = await fetch(`${KALSHI_API}/portfolio/orders`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Kalshi order failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  return {
    orderId: data.order?.order_id ?? '',
    status: data.order?.status ?? 'submitted',
  };
}

// Demo data — only shown when the live API is unreachable
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
