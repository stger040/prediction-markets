import { ArbitrageOpportunity, MarketPair, Platform } from './types';

// Per-contract taker fee: charged on entry, not payout.
// Kalshi: 7% × P × (1-P)  |  Polymarket: 6.25% × P × (1-P)
// Peaks at 50¢ contracts, drops toward 0¢/100¢ extremes.
export function tradingFee(platform: Platform, price: number): number {
  const p = Math.max(0, Math.min(1, price));
  if (platform === 'kalshi')     return 0.07   * p * (1 - p);
  if (platform === 'polymarket') return 0.0625 * p * (1 - p);
  if (platform === 'ibkr')       return 0.0625 * p * (1 - p);
  return 0;
}

export const TOTAL_FEE_AT_MID =
  tradingFee('kalshi', 0.5) + tradingFee('polymarket', 0.5); // ≈ 0.0331

const MIN_GROSS_PROFIT_PCT   = 0.005;
const MIN_NET_PROFIT_PCT     = 0.005;
const MAX_PROFIT_PCT         = 0.25;
const MAX_END_DATE_DIFF_DAYS = 730;

export function calculateArbitrage(pair: MarketPair): ArbitrageOpportunity | null {
  const { marketA, marketB, matchScore } = pair;

  const combinations = [
    {
      buyYesOn: marketA.platform,
      buyNoOn:  marketB.platform,
      yesMarket: marketA,
      noMarket:  marketB,
      yesPrice: marketA.yesPrice,
      noPrice:  marketB.noPrice,
    },
    {
      buyYesOn: marketB.platform,
      buyNoOn:  marketA.platform,
      yesMarket: marketB,
      noMarket:  marketA,
      yesPrice: marketB.yesPrice,
      noPrice:  marketA.noPrice,
    },
  ];

  let best = combinations[0];
  for (const combo of combinations) {
    if (combo.yesPrice + combo.noPrice < best.yesPrice + best.noPrice) {
      best = combo;
    }
  }

  const combinedCost   = best.yesPrice + best.noPrice;
  const grossProfitPct = (1 - combinedCost) / combinedCost;

  if (grossProfitPct < MIN_GROSS_PROFIT_PCT) return null;
  if (grossProfitPct > MAX_PROFIT_PCT)       return null;

  const dateA    = new Date(marketA.endDate).getTime();
  const dateB    = new Date(marketB.endDate).getTime();
  const diffDays = Math.abs(dateA - dateB) / (1000 * 60 * 60 * 24);
  if (diffDays > MAX_END_DATE_DIFF_DAYS) return null;

  const feeYes = tradingFee(best.buyYesOn, best.yesPrice);
  const feeNo  = tradingFee(best.buyNoOn,  best.noPrice);
  const totalFeeEstimate = feeYes + feeNo;
  const netProfitPct = (1 - combinedCost - totalFeeEstimate) / combinedCost;
  const confirmedProfitable = netProfitPct >= MIN_NET_PROFIT_PCT;

  return {
    id: `${marketA.id}__${marketB.id}`,
    question: marketA.question,
    matchScore,
    grossProfitPct,
    netProfitPct,
    totalFeeEstimate,
    confirmedProfitable,
    buyYesOn: best.buyYesOn,
    buyNoOn:  best.buyNoOn,
    yesPrice: best.yesPrice,
    noPrice:  best.noPrice,
    combinedCost,
    marketA: best.yesMarket,
    marketB: best.noMarket,
    updatedAt: new Date().toISOString(),
  };
}

export function rankOpportunities(pairs: MarketPair[]): {
  opportunities: ArbitrageOpportunity[];
  nearMisses: ArbitrageOpportunity[];
} {
  const all = pairs
    .map(calculateArbitrage)
    .filter((o): o is ArbitrageOpportunity => o !== null);

  const opportunities = all
    .filter(o => o.confirmedProfitable)
    .sort((a, b) => b.netProfitPct - a.netProfitPct);

  const nearMisses = all
    .filter(o => !o.confirmedProfitable)
    .sort((a, b) => b.grossProfitPct - a.grossProfitPct)
    .slice(0, 10);

  return { opportunities, nearMisses };
}
