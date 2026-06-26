export type Platform = 'polymarket' | 'kalshi' | 'ibkr';

export interface NormalizedMarket {
  id: string;
  platform: Platform;
  question: string;
  normalizedQuestion: string;
  category: string;
  yesPrice: number;
  noPrice: number;
  volume24h: number;
  liquidity: number;
  endDate: string;
  url: string;
  slug: string;
  conditionId?: string;
  clobTokenIds?: [string, string];
}

export interface ArbitrageOpportunity {
  id: string;
  question: string;
  matchScore: number;
  grossProfitPct: number;
  netProfitPct: number;
  totalFeeEstimate: number;
  confirmedProfitable: boolean;
  buyYesOn: Platform;
  buyNoOn: Platform;
  yesPrice: number;
  noPrice: number;
  combinedCost: number;
  marketA: NormalizedMarket;
  marketB: NormalizedMarket;
  updatedAt: string;
}

export interface MarketPair {
  marketA: NormalizedMarket;
  marketB: NormalizedMarket;
  matchScore: number;
}

export interface ArbApiResponse {
  opportunities: ArbitrageOpportunity[];
  nearMisses: ArbitrageOpportunity[];
  meta: {
    platformACount: number;
    platformBCount: number;
    platformAName: string;
    platformBName: string;
    pairsFound: number;
    opportunitiesFound: number;
    nearMissCount: number;
    kalshiFeeEstimate: number;
    usingDemoData: boolean;
    fetchedAt: string;
  };
  error?: string;
}
