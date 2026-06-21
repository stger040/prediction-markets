/**
 * Arbitrage calculator — works for any two-platform pair.
 *
 * Given a matched market pair, find the cheapest combination of:
 *   - YES on platform A + NO on platform B
 *   - YES on platform B + NO on platform A
 *
 * If the cheapest combination costs < $1.00, the difference is
 * guaranteed profit regardless of outcome.
 */

import { ArbitrageOpportunity, MarketPair, Platform } from './types';

// Platform exchange fees on payout — charged when you collect the $1 win.
// Only ONE leg pays out (the one that resolves YES), so you pay ONE platform's fee.
// Kalshi: ~3% on payout (verified at kalshi.com/fee-schedule — varies by market)
// Polymarket: ~0% on payout (fees embedded in spread / protocol layer)
// Update these if platforms change their schedules.
const PAYOUT_FEE: Record<Platform, number> = {
  kalshi:     0.03,  // 3% of $1.00 payout = $0.03 per contract
  polymarket: 0.00,  // no explicit payout fee
  ibkr:       0.00,  // placeholder
};

// Minimum NET profit after fees to surface an opportunity
const MIN_NET_PROFIT_PCT = 0.005; // 0.5%
// Maximum plausible profit — anything higher is almost certainly a false match
const MAX_PROFIT_PCT = 0.25; // 25%
// Maximum end-date gap between matched markets
const MAX_END_DATE_DIFF_DAYS = 730; // 2 years

export function calculateArbitrage(pair: MarketPair): ArbitrageOpportunity | null {
  const { marketA, marketB, matchScore } = pair;

  const combinations = [
    {
      buyYesOn: marketA.platform,
      buyNoOn: marketB.platform,
      yesMarket: marketA,
      noMarket: marketB,
      yesPrice: marketA.yesPrice,
      noPrice: marketB.noPrice,
    },
    {
      buyYesOn: marketB.platform,
      buyNoOn: marketA.platform,
      yesMarket: marketB,
      noMarket: marketA,
      yesPrice: marketB.yesPrice,
      noPrice: marketA.noPrice,
    },
  ];

  let best = combinations[0];
  for (const combo of combinations) {
    if (combo.yesPrice + combo.noPrice < best.yesPrice + best.noPrice) {
      best = combo;
    }
  }

  const combinedCost = best.yesPrice + best.noPrice;
  const grossProfitPct = (1 - combinedCost) / combinedCost;

  if (grossProfitPct > MAX_PROFIT_PCT) return null;

  // Fee is paid on the $1 payout, but only by the platform whose leg wins.
  // In the worst case (fee on the more expensive platform), deduct the higher fee.
  // Using max() ensures we never overstate net profit.
  const worstCaseFee = Math.max(
    PAYOUT_FEE[best.buyYesOn],
    PAYOUT_FEE[best.buyNoOn],
  );
  // Net payout = $1 - fee; net profit = net payout - cost
  const netProfit = (1 - worstCaseFee) - combinedCost;
  const netProfitPct = netProfit / combinedCost;

  if (netProfitPct < MIN_NET_PROFIT_PCT) return null;

  // Skip pairs where resolution dates differ significantly.
  const dateA = new Date(marketA.endDate).getTime();
  const dateB = new Date(marketB.endDate).getTime();
  const diffDays = Math.abs(dateA - dateB) / (1000 * 60 * 60 * 24);
  if (diffDays > MAX_END_DATE_DIFF_DAYS) return null;

  return {
    id: `${marketA.id}__${marketB.id}`,
    question: marketA.question,
    matchScore,
    profitPct: netProfitPct,   // net of platform fees
    buyYesOn: best.buyYesOn,
    buyNoOn: best.buyNoOn,
    yesPrice: best.yesPrice,
    noPrice: best.noPrice,
    combinedCost,
    marketA: best.yesMarket,
    marketB: best.noMarket,
    updatedAt: new Date().toISOString(),
  };
}

export function rankOpportunities(pairs: MarketPair[]): ArbitrageOpportunity[] {
  return pairs
    .map(calculateArbitrage)
    .filter((o): o is ArbitrageOpportunity => o !== null)
    .sort((a, b) => b.profitPct - a.profitPct);
}
