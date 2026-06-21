import { NormalizedMarket } from './types';

const KALSHI_API = 'https://external-api.kalshi.com/trade-api/v2';

interface KalshiMarket {
  ticker: string;
  title: string;
  subtitle?: string;
  yes_sub_title?: string;
  category?: string;
  status: string;
  close_time: string;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  no_bid_dollars?: string;
  no_ask_dollars?: string;
  volume_24h_fp?: string;
  liquidity_dollars?: string;
  yes_bid?: number;
  yes_ask?: number;
  no_bid?: number;
  no_ask?: number;
  volume_24h?: number;
  liquidity?: number;
}

interface KalshiEvent {
  event_ticker: string;
  title: string;
  category?: string;
  status: string;
  markets?: KalshiMarket[];
}

function parsePrice(dollars?: string, cents?: number): number {
  if (dollars !== undefined && dollars !== '') return parseFloat(dollars);
  if (cents !== undefined) return cents / 100;
  return 0.5;
}

function normalizeQuestion(title: string, subtitle: string): string {
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

function normalizeMarket(m: KalshiMarket): NormalizedMarket {
  const subtitle = m.subtitle || m.yes_sub_title || '';
  const question = (subtitle && subtitle !== m.title)
    ? `${m.title}: ${subtitle}`
    : m.title;

  const yes = parsePrice(m.yes_bid_dollars ?? m.yes_ask_dollars, m.yes_bid ?? m.yes_ask);
  const no  = parsePrice(m.no_bid_dollars  ?? m.no_ask_dollars,  m.no_bid  ?? m.no_ask);

  return {
    id: m.ticker,
    platform: 'kalshi',
    question,
    normalizedQuestion: normalizeQuestion(m.title, subtitle),
    category: m.category || 'General',
    yesPrice: yes,
    noPrice: no,
    volume24h: (parseFloat(m.volume_24h_fp ?? '') || m.volume_24h) ?? 0,
    liquidity: (parseFloat(m.liquidity_dollars ?? '') || m.liquidity) ?? 0,
    endDate: m.close_time,
    url: `https://kalshi.com/markets/${m.ticker}`,
    slug: m.ticker,
  };
}

export async function fetchKalshiMarkets(): Promise<NormalizedMarket[]> {
  try {
    const res = await fetch(
      `${KALSHI_API}/events?status=open&limit=200&with_nested_markets=true`,
      { headers: { 'Content-Type': 'application/json' } },
    );

    if (!res.ok) {
      console.error(`[Kalshi] Events API error ${res.status}`);
      return getDemoMarkets();
    }

    const data: { events?: KalshiEvent[] } = await res.json();
    const events = data.events ?? [];

    if (!events.length) return getDemoMarkets();

    const markets: NormalizedMarket[] = [];
    for (const event of events) {
      if (event.event_ticker?.toUpperCase().startsWith('KXMV')) continue;
      if (event.status === 'settled' || event.status === 'determined' || event.status === 'closed') continue;
      for (const m of event.markets ?? []) {
        markets.push(normalizeMarket(m));
      }
    }

    console.log(`[Kalshi] ${markets.length} markets from ${events.length} events`);
    return markets.length ? markets : getDemoMarkets();
  } catch (err) {
    console.error('[Kalshi] Request failed:', err instanceof Error ? err.message : err);
    return getDemoMarkets();
  }
}

function getDemoMarkets(): NormalizedMarket[] {
  return [
    {
      id: 'FED-26JUL', platform: 'kalshi',
      question: 'Fed rate cut in July 2026?',
      normalizedQuestion: 'fed cut july 2026',
      category: 'Economics', yesPrice: 0.38, noPrice: 0.63,
      volume24h: 1_800_000, liquidity: 620_000,
      endDate: '2026-07-30', url: 'https://kalshi.com/markets/FED-26JUL', slug: 'FED-26JUL',
    },
    {
      id: 'BTC-100K-JUL26', platform: 'kalshi',
      question: 'Bitcoin above $100,000 end of July 2026?',
      normalizedQuestion: 'bitcoin above 100000 end july 2026',
      category: 'Crypto', yesPrice: 0.51, noPrice: 0.50,
      volume24h: 3_200_000, liquidity: 1_100_000,
      endDate: '2026-07-31', url: 'https://kalshi.com/markets/BTC-100K-JUL26', slug: 'BTC-100K-JUL26',
    },
  ];
}
