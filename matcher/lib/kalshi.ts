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

function normalizeQuestion(text: string): string {
  return expandPhrases(text)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\?$/, '')
    .replace(/will\s+/g, '')
    .replace(/the\s+/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeMarket(m: KalshiMarket, eventTitle = '', eventCategory?: string): NormalizedMarket {
  const subtitle = m.subtitle || m.yes_sub_title || '';
  const question = eventTitle && m.title !== eventTitle
    ? `${eventTitle}: ${m.title}${subtitle && subtitle !== m.title ? ' - ' + subtitle : ''}`
    : (subtitle && subtitle !== m.title ? `${m.title}: ${subtitle}` : m.title);

  const yes = parsePrice(m.yes_bid_dollars ?? m.yes_ask_dollars, m.yes_bid ?? m.yes_ask);
  const no  = parsePrice(m.no_bid_dollars  ?? m.no_ask_dollars,  m.no_bid  ?? m.no_ask);

  return {
    id: m.ticker,
    platform: 'kalshi',
    question,
    normalizedQuestion: normalizeQuestion([eventTitle, m.title, subtitle].filter(Boolean).join(' ')),
    category: eventCategory || m.category || 'General',
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
  const allEvents: KalshiEvent[] = [];
  let cursor: string | undefined;
  let page = 0;
  const MAX_PAGES = 15;

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
        console.error(`[Kalshi] Events API error ${res.status}`);
        break;
      }

      const data: { events?: KalshiEvent[]; cursor?: string } = await res.json();
      const batch = data.events ?? [];
      allEvents.push(...batch);
      cursor = data.cursor || undefined;
      page++;
      console.log(`[Kalshi] Page ${page}: ${batch.length} events (cursor: ${cursor ? 'yes' : 'done'})`);
    } while (cursor && page < MAX_PAGES);

    console.log(`[Kalshi] Total: ${allEvents.length} events across ${page} page(s)`);

    if (!allEvents.length) return getDemoMarkets();

    const markets: NormalizedMarket[] = [];
    for (const event of allEvents) {
      if (event.event_ticker?.toUpperCase().startsWith('KXMV')) continue;
      if (event.status === 'settled' || event.status === 'determined' || event.status === 'closed') continue;
      for (const m of event.markets ?? []) {
        markets.push(normalizeMarket(m, event.title, event.category));
      }
    }

    console.log(`[Kalshi] ${markets.length} markets from ${allEvents.length} events (after KXMV filter)`);
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
