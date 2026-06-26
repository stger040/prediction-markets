/**
 * Arbitrage calculator — works for any two-platform pair.
 *
 * Returns two lists:
 *   opportunities — net profit after platform fees is positive (actionable)
 *   nearMisses    — gross profit is positive but fees wipe it out
 *
 * Fee model (2026):
 *   Kalshi taker:     0.07  × P × (1−P)  per contract  [CFTC-regulated exchange fee]
 *   Polymarket taker: 0.0625 × P × (1−P) per contract  [CLOB taker fee]
 *   Both fees are charged on ENTRY (when you place the order), not on payout.
 *   The P×(1−P) shape means fees peak at 50¢ contracts and drop near 0¢/100¢.
 *   We assume taker fills throughout since arb requires immediate execution.
 */

import { ArbitrageOpportunity, MarketPair, Platform } from './types';

// Per-contract taker fee charged on entry, as a function of the contract price P.
// Source: Kalshi fee schedule 2026 (7% × P × (1-P)); Polymarket CLOB (6.25% × P × (1-P))
export function tradingFee(platform: Platform, price: number): number {
  const p = Math.max(0, Math.min(1, price));
  if (platform === 'kalshi')     return 0.07   * p * (1 - p);
  if (platform === 'polymarket') return 0.0625 * p * (1 - p);
  if (platform === 'ibkr')       return 0.0625 * p * (1 - p); // ForecastEx, same model
  return 0;
}

// Representative total fee at the mid-price (P=0.5) — used for UI labels.
// Kalshi: 0.07×0.25 = 1.75¢; Polymarket: 0.0625×0.25 = 1.5625¢; combined ≈ 3.31%
export const TOTAL_FEE_AT_MID =
  tradingFee('kalshi', 0.5) + tradingFee('polymarket', 0.5); // ≈ 0.0331

const MIN_GROSS_PROFIT_PCT   = 0.005; // 0.5%
const MIN_NET_PROFIT_PCT     = 0.005; // 0.5%
const MAX_PROFIT_PCT         = 0.25;  // 25% — higher almost always means a mismatch
const MAX_END_DATE_DIFF_DAYS = 730;   // 2 years

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

  // Taker fee on each leg at entry, computed from the actual price using platform formula.
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

  // Near misses: gross profit > 0 but net is negative after fees.
  // Cap at 10 — sorted by gross profit so user sees the closest calls first.
  const nearMisses = all
    .filter(o => !o.confirmedProfitable)
    .sort((a, b) => b.grossProfitPct - a.grossProfitPct)
    .slice(0, 10);

  return { opportunities, nearMisses };
}
