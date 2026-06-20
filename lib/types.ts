export type Platform = 'polymarket' | 'kalshi' | 'ibkr';

export type AppMode = 'us' | 'global';

export interface NormalizedMarket {
  id: string;
  platform: Platform;
  question: string;
  normalizedQuestion: string;
  category: string;
  yesPrice: number;   // 0-1 probability
  noPrice: number;    // 0-1 probability
  volume24h: number;  // USD
  liquidity: number;  // USD
  endDate: string;
  url: string;
  slug: string;
}

export interface ArbitrageOpportunity {
  id: string;
  question: string;
  matchScore: number;       // 0-1 confidence this is the same event
  profitPct: number;        // e.g. 0.04 = 4% guaranteed profit
  buyYesOn: Platform;
  buyNoOn: Platform;
  yesPrice: number;
  noPrice: number;
  combinedCost: number;     // yesPrice + noPrice; profit = 1 - combinedCost
  marketA: NormalizedMarket;  // the platform you buy YES on
  marketB: NormalizedMarket;  // the platform you buy NO on
  updatedAt: string;
}

export interface MarketPair {
  marketA: NormalizedMarket;
  marketB: NormalizedMarket;
  matchScore: number;
}

export interface ArbApiResponse {
  opportunities: ArbitrageOpportunity[];
  meta: {
    platformACount: number;
    platformBCount: number;
    platformAName: string;
    platformBName: string;
    pairsFound: number;
    opportunitiesFound: number;
    usingDemoData: boolean;
    fetchedAt: string;
  };
  error?: string;
}
