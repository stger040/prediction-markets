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
  // Polymarket-only fields for CLOB order placement
  conditionId?: string;
  clobTokenIds?: [string, string]; // [yesTokenId, noTokenId]
}

export interface OrderLeg {
  platform: Platform;
  ticker: string;          // Kalshi ticker or Polymarket conditionId
  side: 'yes' | 'no';
  price: number;           // 0-1
  contracts: number;
  estimatedCostUsd: number;
  // Polymarket-specific
  clobTokenId?: string;
}

export interface PlaceOrderResult {
  platform: Platform;
  orderId?: string;
  status: string;
  error?: string;
}

export interface ArbitrageOpportunity {
  id: string;
  question: string;
  matchScore: number;           // 0-1 confidence this is the same event
  grossProfitPct: number;       // profit before platform fees, e.g. 0.04 = 4%
  netProfitPct: number;         // profit after taker fees on both legs
  totalFeeEstimate: number;     // sum of both taker fees: 0.07×P×(1-P) + 0.0625×P×(1-P)
  confirmedProfitable: boolean; // true when netProfitPct > MIN threshold
  buyYesOn: Platform;
  buyNoOn: Platform;
  yesPrice: number;
  noPrice: number;
  combinedCost: number;         // yesPrice + noPrice (before fees)
  marketA: NormalizedMarket;    // the platform you buy YES on
  marketB: NormalizedMarket;    // the platform you buy NO on
  updatedAt: string;
}

export interface MarketPair {
  marketA: NormalizedMarket;
  marketB: NormalizedMarket;
  matchScore: number;
}

export interface ArbApiResponse {
  opportunities: ArbitrageOpportunity[];   // net profit > 0.5% after fees
  nearMisses: ArbitrageOpportunity[];      // gross profit > 0.5%, wiped out by fees
  meta: {
    platformACount: number;
    platformBCount: number;
    platformAName: string;
    platformBName: string;
    pairsFound: number;
    opportunitiesFound: number;
    nearMissCount: number;
    kalshiFeeEstimate: number;             // e.g. 0.03 = 3% — verify per market
    usingDemoData: boolean;
    fetchedAt: string;
  };
  error?: string;
}
