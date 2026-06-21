/**
 * Arbitrage calculator — works for any two-platform pair.
 *
 * Returns two lists:
 *   opportunities — net profit after platform fees is positive (actionable)
 *   nearMisses    — gross profit is positive but fee wipes it out; user should
 *                   verify the actual per-market fee on Kalshi before dismissing
 */

import { ArbitrageOpportunity, MarketPair, Platform } from './types';

// Platform exchange fees on payout — charged when you collect the $1 win.
// Only ONE leg pays out per trade, so you pay ONE platform's fee.
// Kalshi: ~3% on payout (kalshi.com/fee-schedule — varies by market, verify live)
// Polymarket: ~0% (fees embedded in spread/protocol)
export const PAYOUT_FEE: Record<Platform, number> = {
  kalshi:     0.03,
  polymarket: 0.00,
  ibkr:       0.00,
};

// Minimum GROSS profit to bother showing (below this the pair is noise)
const MIN_GROSS_PROFIT_PCT = 0.005; // 0.5%
// Minimum NET profit (after fees) to count as a confirmed opportunity
const MIN_NET_PROFIT_PCT   = 0.005; // 0.5%
// Maximum plausible profit — higher almost always means mismatched questions
const MAX_PROFIT_PCT = 0.25;        // 25%
// Maximum end-date gap between matched markets
const MAX_END_DATE_DIFF_DAYS = 730; // 2 years

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

  // Reject noise and obvious false-matches
  if (grossProfitPct < MIN_GROSS_PROFIT_PCT) return null;
  if (grossProfitPct > MAX_PROFIT_PCT) return null;

  // Skip pairs with very different resolution dates
  const dateA    = new Date(marketA.endDate).getTime();
  const dateB    = new Date(marketB.endDate).getTime();
  const diffDays = Math.abs(dateA - dateB) / (1000 * 60 * 60 * 24);
  if (diffDays > MAX_END_DATE_DIFF_DAYS) return null;

  // Fee is paid only by the platform whose leg resolves as the winner.
  // Worst-case: the higher-fee platform wins → deduct that fee.
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

  // Near misses: gross profit > 0 but net is negative after fees.
  // Cap at 10 — sorted by gross profit so user sees the closest calls first.
  const nearMisses = all
    .filter(o => !o.confirmedProfitable)
    .sort((a, b) => b.grossProfitPct - a.grossProfitPct)
    .slice(0, 10);

  return { opportunities, nearMisses };
}
