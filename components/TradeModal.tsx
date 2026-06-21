'use client';
import { useState } from 'react';
import { X, Loader2, CheckCircle2, AlertCircle, Zap } from 'lucide-react';
import { ArbitrageOpportunity, PlaceOrderResult } from '@/lib/types';
import clsx from 'clsx';

interface TradeModalProps {
  opportunity: ArbitrageOpportunity | null;
  onClose: () => void;
}

interface LegStatus {
  platform: string;
  state: 'idle' | 'loading' | 'success' | 'error';
  message?: string;
}

const PLATFORM_COLOR: Record<string, string> = {
  kalshi:     'text-green-400',
  polymarket: 'text-purple-400',
  ibkr:       'text-blue-400',
};

export function TradeModal({ opportunity: opp, onClose }: TradeModalProps) {
  const [contracts, setContracts] = useState(1);
  const [legs, setLegs] = useState<LegStatus[]>([]);
  const [executing, setExecuting] = useState(false);
  const [done, setDone] = useState(false);

  if (!opp) return null;

  const totalCost    = (opp.yesPrice + opp.noPrice) * contracts;
  const profitDollar = (1 - opp.yesPrice - opp.noPrice) * contracts;
  const profitPct    = opp.profitPct * 100;

  async function executeTrade() {
    if (!opp) return;
    setExecuting(true);
    setDone(false);
    setLegs([
      { platform: opp.buyYesOn, state: 'loading' },
      { platform: opp.buyNoOn,  state: 'loading' },
    ]);

    const kalshiSide  = opp.buyYesOn === 'kalshi' ? 'yes' : 'no';
    const polySide    = opp.buyYesOn === 'polymarket' ? 'yes' : 'no';
    const kalshiMarket = opp.buyYesOn === 'kalshi' ? opp.marketA : opp.marketB;
    const polyMarket   = opp.buyYesOn === 'polymarket' ? opp.marketA : opp.marketB;
    const kalshiPrice  = opp.buyYesOn === 'kalshi' ? opp.yesPrice : opp.noPrice;
    const polyPrice    = opp.buyYesOn === 'polymarket' ? opp.yesPrice : opp.noPrice;
    const kalshiCents  = Math.round(kalshiPrice * 100);

    const [kalshiRes, polyRes] = await Promise.allSettled([
      fetch('/api/orders/kalshi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker:     kalshiMarket.slug,
          side:       kalshiSide,
          contracts,
          priceCents: kalshiCents,
        }),
      }).then(r => r.json()),

      fetch('/api/orders/polymarket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conditionId: polyMarket.conditionId,
          clobTokenId: polyMarket.clobTokenIds?.[polySide === 'yes' ? 0 : 1],
          side:        polySide,
          price:       polyPrice,
          contracts,
        }),
      }).then(r => r.json()),
    ]);

    const kalshiLeg: LegStatus = (() => {
      if (kalshiRes.status === 'fulfilled') {
        const d = kalshiRes.value;
        return d.error
          ? { platform: opp!.buyYesOn, state: 'error' as const,   message: d.error }
          : { platform: opp!.buyYesOn, state: 'success' as const, message: `Order ID: ${d.orderId} (${d.status})` };
      }
      return { platform: opp!.buyYesOn, state: 'error' as const, message: String(kalshiRes.reason) };
    })();

    const polyLeg: LegStatus = (() => {
      if (polyRes.status === 'fulfilled') {
        const d = polyRes.value;
        return d.error
          ? { platform: opp!.buyNoOn, state: 'error' as const,   message: d.error }
          : { platform: opp!.buyNoOn, state: 'success' as const, message: `Order ID: ${d.orderId} (${d.status})` };
      }
      return { platform: opp!.buyNoOn, state: 'error' as const, message: String(polyRes.reason) };
    })();

    setLegs([kalshiLeg, polyLeg]);
    setExecuting(false);
    setDone(true);
  }

  const hasPolymarket = opp.marketA.platform === 'polymarket' || opp.marketB.platform === 'polymarket';
  const polyMarketForCheck = opp.marketA.platform === 'polymarket' ? opp.marketA : opp.marketB;
  const polyReadyForTrading = !!(polyMarketForCheck.conditionId || polyMarketForCheck.clobTokenIds);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#0d0d14] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <span className="font-bold text-white">Execute Arbitrage Trade</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Question */}
          <p className="text-sm text-gray-300 leading-snug">{opp.question}</p>

          {/* Legs summary */}
          <div className="grid grid-cols-2 gap-2">
            <div className={clsx('rounded-xl bg-white/5 p-3 border border-white/10')}>
              <div className={clsx('text-[10px] font-bold uppercase mb-1', PLATFORM_COLOR[opp.buyYesOn])}>
                {opp.buyYesOn}
              </div>
              <div className="text-emerald-400 font-black text-base">BUY YES</div>
              <div className="text-white font-bold">{(opp.yesPrice * 100).toFixed(1)}¢</div>
            </div>
            <div className={clsx('rounded-xl bg-white/5 p-3 border border-white/10')}>
              <div className={clsx('text-[10px] font-bold uppercase mb-1', PLATFORM_COLOR[opp.buyNoOn])}>
                {opp.buyNoOn}
              </div>
              <div className="text-rose-400 font-black text-base">BUY NO</div>
              <div className="text-white font-bold">{(opp.noPrice * 100).toFixed(1)}¢</div>
            </div>
          </div>

          {/* Contracts input */}
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Number of contracts</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setContracts(c => Math.max(1, c - 1))}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold transition-colors"
              >−</button>
              <input
                type="number"
                min={1}
                value={contracts}
                onChange={e => setContracts(Math.max(1, parseInt(e.target.value) || 1))}
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-center text-sm focus:outline-none focus:border-amber-500/50"
              />
              <button
                onClick={() => setContracts(c => c + 1)}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold transition-colors"
              >+</button>
            </div>
            <p className="text-xs text-gray-600 mt-1">1 contract = 1 share, pays $1 on resolution</p>
          </div>

          {/* P&L preview */}
          <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Total cost</span>
              <span className="text-white font-semibold">${totalCost.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Guaranteed payout</span>
              <span className="text-white font-semibold">${contracts.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm border-t border-white/10 pt-1.5">
              <span className="text-gray-400">Locked-in profit</span>
              <span className="text-emerald-400 font-bold">
                +${profitDollar.toFixed(2)} ({profitPct.toFixed(2)}%)
              </span>
            </div>
          </div>

          {/* Polymarket setup warning */}
          {hasPolymarket && !polyReadyForTrading && (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3">
              <p className="text-xs text-amber-300 font-semibold mb-1">Polymarket setup required</p>
              <p className="text-xs text-amber-400/70">
                Set POLY_PRIVATE_KEY, POLY_API_KEY, POLY_SECRET, and POLY_PASSPHRASE in Vercel
                env vars to enable automated Polymarket order placement.
              </p>
            </div>
          )}

          {/* Execution results */}
          {legs.length > 0 && (
            <div className="space-y-2">
              {legs.map((leg, i) => (
                <div
                  key={i}
                  className={clsx(
                    'flex items-start gap-2 rounded-lg p-3 text-xs border',
                    leg.state === 'success' && 'bg-emerald-500/10 border-emerald-500/30',
                    leg.state === 'error'   && 'bg-red-500/10 border-red-500/30',
                    leg.state === 'loading' && 'bg-white/5 border-white/10',
                  )}
                >
                  {leg.state === 'loading' && <Loader2 className="w-4 h-4 text-gray-400 animate-spin shrink-0 mt-0.5" />}
                  {leg.state === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
                  {leg.state === 'error'   && <AlertCircle  className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />}
                  <div>
                    <div className={clsx('font-semibold capitalize', PLATFORM_COLOR[leg.platform])}>
                      {leg.platform}
                    </div>
                    {leg.message && <div className="text-gray-400 mt-0.5">{leg.message}</div>}
                    {leg.state === 'loading' && <div className="text-gray-500">Placing order…</div>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Action buttons */}
          {!done ? (
            <button
              onClick={executeTrade}
              disabled={executing}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold text-sm transition-colors flex items-center justify-center gap-2"
            >
              {executing ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Executing…</>
              ) : (
                <><Zap className="w-4 h-4" /> Execute Trade ({contracts} contract{contracts !== 1 ? 's' : ''})</>
              )}
            </button>
          ) : (
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-sm transition-colors"
            >
              Close
            </button>
          )}

          <p className="text-[11px] text-gray-600 text-center">
            Always verify prices on each platform before executing. Fees reduce net profit.
          </p>
        </div>
      </div>
    </div>
  );
}
