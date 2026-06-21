import { ArbitrageOpportunity, MarketPair, Platform } from './types';

export const PAYOUT_FEE: Record<Platform, number> = {
  kalshi:     0.03,
  polymarket: 0.00,
  ibkr:       0.00,
};

const MIN_GROSS_PROFIT_PCT = 0.005;
const MIN_NET_PROFIT_PCT   = 0.005;
const MAX_PROFIT_PCT = 0.25;
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

  const combinedCost    = best.yesPrice + best.noPrice;
  const grossProfitPct  = (1 - combinedCost) / combinedCost;

  if (grossProfitPct < MIN_GROSS_PROFIT_PCT) return null;
  if (grossProfitPct > MAX_PROFIT_PCT) return null;

  const dateA    = new Date(marketA.endDate).getTime();
  const dateB    = new Date(marketB.endDate).getTime();
  const diffDays = Math.abs(dateA - dateB) / (1000 * 60 * 60 * 24);
  if (diffDays > MAX_END_DATE_DIFF_DAYS) return null;

  const worstCaseFee  = Math.max(PAYOUT_FEE[best.buyYesOn], PAYOUT_FEE[best.buyNoOn]);
  const netProfitPct  = ((1 - worstCaseFee) - combinedCost) / combinedCost;
  const confirmedProfitable = netProfitPct >= MIN_NET_PROFIT_PCT;

  return {
    id: `${marketA.id}__${marketB.id}`,
    question: marketA.question,
    matchScore,
    grossProfitPct,
    netProfitPct,
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
