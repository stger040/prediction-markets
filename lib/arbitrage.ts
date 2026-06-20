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
