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

import { ArbitrageOpportunity, MarketPair } from './types';

// Minimum profit to surface (fees eat into tiny spreads)
const MIN_PROFIT_PCT = 0.005; // 0.5%
// Maximum plausible profit — anything higher is almost certainly a false match
// (mismatched questions that share keywords but ask different things)
const MAX_PROFIT_PCT = 0.25; // 25%
// Maximum end-date gap between matched markets (in days)
// Wider window = different resolution criteria = not the same binary bet
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
  const profitPct = (1 - combinedCost) / combinedCost;

  if (profitPct < MIN_PROFIT_PCT) return null;
  if (profitPct > MAX_PROFIT_PCT) return null;

  // Skip pairs where resolution dates differ significantly — different end dates mean
  // the markets ask subtly different questions and the payoff structure differs.
  const dateA = new Date(marketA.endDate).getTime();
  const dateB = new Date(marketB.endDate).getTime();
  const diffDays = Math.abs(dateA - dateB) / (1000 * 60 * 60 * 24);
  if (diffDays > MAX_END_DATE_DIFF_DAYS) return null;

  return {
    id: `${marketA.id}__${marketB.id}`,
    question: marketA.question,
    matchScore,
    profitPct,
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
