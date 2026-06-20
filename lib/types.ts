export interface NormalizedMarket {
  id: string;
  platform: 'polymarket' | 'kalshi';
  question: string;
  // normalizedQuestion is the cleaned-up text used for matching
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
  matchScore: number;         // 0-1 confidence that these are the same event
  profitPct: number;          // e.g. 0.04 = 4% guaranteed profit
  // Which side to buy on which platform
  buyYesOn: 'polymarket' | 'kalshi';
  buyNoOn: 'polymarket' | 'kalshi';
  yesPrice: number;           // price to buy YES
  noPrice: number;            // price to buy NO
  combinedCost: number;       // yesPrice + noPrice (should be < 1.00 for arb)
  polymarket: NormalizedMarket;
  kalshi: NormalizedMarket;
  updatedAt: string;
}

export interface MarketPair {
  polymarket: NormalizedMarket;
  kalshi: NormalizedMarket;
  matchScore: number;
}
