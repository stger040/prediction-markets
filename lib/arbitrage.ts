/**
 * Arbitrage calculator
 *
 * Core logic: given two markets for the same event,
 * find the cheapest way to hold BOTH sides (YES on one, NO on the other).
 * If yesPrice + noPrice < 1.00, you have a guaranteed profit no matter what happens.
 *
 * Example:
 *   Polymarket YES: 0.62  (62¢)
 *   Kalshi    NO:   0.35  (35¢)
 *   Total cost:     0.97  → profit = 3¢ per $1 wagered = 3.09% return
 */

import { NormalizedMarket, ArbitrageOpportunity, MarketPair } from './types';

export function calculateArbitrage(pair: MarketPair): ArbitrageOpportunity | null {
  const { polymarket: poly, kalshi, matchScore } = pair;

  // Find the best combination: buy YES on one platform, NO on the other
  const combinations = [
    {
      buyYesOn: 'polymarket' as const,
      buyNoOn: 'kalshi' as const,
      yesPrice: poly.yesPrice,
      noPrice: kalshi.noPrice,
    },
    {
      buyYesOn: 'kalshi' as const,
      buyNoOn: 'polymarket' as const,
      yesPrice: kalshi.yesPrice,
      noPrice: poly.noPrice,
    },
  ];

  let best: (typeof combinations)[0] | null = null;
  let bestCost = 1.0; // only interested in sub-1.00 combinations

  for (const combo of combinations) {
    const cost = combo.yesPrice + combo.noPrice;
    if (cost < bestCost) {
      bestCost = cost;
      best = combo;
    }
  }

  if (!best) return null;

  const combinedCost = best.yesPrice + best.noPrice;
  const profitPct = (1 - combinedCost) / combinedCost;

  // Only surface opportunities with at least 0.5% profit (fees eat into smaller ones)
  if (profitPct < 0.005) return null;

  return {
    id: `${poly.id}__${kalshi.id}`,
    question: poly.question,
    matchScore,
    profitPct,
    buyYesOn: best.buyYesOn,
    buyNoOn: best.buyNoOn,
    yesPrice: best.yesPrice,
    noPrice: best.noPrice,
    combinedCost,
    polymarket: poly,
    kalshi,
    updatedAt: new Date().toISOString(),
  };
}

export function rankOpportunities(pairs: MarketPair[]): ArbitrageOpportunity[] {
  return pairs
    .map(calculateArbitrage)
    .filter((o): o is ArbitrageOpportunity => o !== null)
    .sort((a, b) => b.profitPct - a.profitPct);
}
