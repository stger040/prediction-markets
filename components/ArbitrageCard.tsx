'use client';
import { ExternalLink, Lock, Zap, AlertCircle } from 'lucide-react';
import { ArbitrageOpportunity, Platform } from '@/lib/types';
import clsx from 'clsx';

interface ArbitrageCardProps {
  opportunity: ArbitrageOpportunity;
  rank: number;
  isBlurred: boolean;
  isNearMiss?: boolean;
  onUpgrade: () => void;
  onExecute?: (opp: ArbitrageOpportunity) => void;
}

const PLATFORM_STYLE: Record<Platform, {
  label: string;
  badge: string;
  card: string;
  border: string;
}> = {
  polymarket: {
    label: 'POLYMARKET',
    badge: 'bg-purple-500/20 text-purple-400',
    card: 'bg-purple-950/40',
    border: 'border-purple-800/40 hover:border-purple-600/60',
  },
  kalshi: {
    label: 'KALSHI',
    badge: 'bg-green-500/20 text-green-400',
    card: 'bg-green-950/40',
    border: 'border-green-800/40 hover:border-green-600/60',
  },
  ibkr: {
    label: 'IBKR ForecastEx',
    badge: 'bg-blue-500/20 text-blue-400',
    card: 'bg-blue-950/40',
    border: 'border-blue-800/40 hover:border-blue-600/60',
  },
};

function ProfitBadge({ grossPct, netPct, isNearMiss }: { grossPct: number; netPct: number; isNearMiss?: boolean }) {
  if (isNearMiss) {
    return (
      <span className="px-2.5 py-0.5 rounded-full text-sm font-bold border bg-gray-500/20 text-gray-400 border-gray-500/30">
        +{(grossPct * 100).toFixed(2)}% gross
      </span>
    );
  }
  const colorClass =
    netPct >= 0.05 ? 'bg-red-500/20 text-red-400 border-red-500/30' :
    netPct >= 0.02 ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
                     'bg-green-500/20 text-green-400 border-green-500/30';
  return (
    <span className={clsx('px-2.5 py-0.5 rounded-full text-sm font-bold border', colorClass)}>
      +{(netPct * 100).toFixed(2)}% net
    </span>
  );
}

function TradeSide({
  platform,
  side,
  price,
  url,
}: {
  platform: Platform;
  side: 'YES' | 'NO';
  price: number;
  url: string;
}) {
  const style = PLATFORM_STYLE[platform];
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={clsx(
        'flex-1 rounded-xl p-3 border transition-all hover:scale-[1.01] cursor-pointer',
        style.card, style.border
      )}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full', style.badge)}>
          {style.label}
        </span>
        <ExternalLink className="w-3 h-3 text-gray-600" />
      </div>
      <div className="text-center mt-2">
        <div className={clsx(
          'text-xl font-black',
          side === 'YES' ? 'text-emerald-400' : 'text-rose-400'
        )}>
          BUY {side}
        </div>
        <div className="text-lg font-bold text-white mt-0.5">
          {(price * 100).toFixed(1)}¢
        </div>
        <div className="text-xs text-gray-500">
          {(price * 100).toFixed(0)}% implied prob.
        </div>
      </div>
    </a>
  );
}

function formatVolume(v: number): string {
  if (v === 0) return 'N/A';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  return `$${(v / 1_000).toFixed(0)}k`;
}

export function ArbitrageCard({ opportunity: o, rank, isBlurred, isNearMiss, onUpgrade, onExecute }: ArbitrageCardProps) {
  return (
    <div className={clsx(
      'relative rounded-2xl border bg-white/[0.03] p-4 transition-all',
      isBlurred   ? 'border-white/5' :
      isNearMiss  ? 'border-white/5 hover:border-white/10' :
                    'border-white/10 hover:border-white/20',
    )}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-gray-600">#{rank}</span>
          <ProfitBadge grossPct={o.grossProfitPct} netPct={o.netProfitPct} isNearMiss={isNearMiss} />
          {isNearMiss && (
            <span className="text-[10px] text-gray-500">
              net {(o.netProfitPct * 100).toFixed(2)}% after ~{(o.totalFeeEstimate * 100).toFixed(2)}% fees
            </span>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-gray-500">combined cost</div>
          <div className="text-sm font-bold text-white">{(o.combinedCost * 100).toFixed(1)}¢</div>
          <div className="text-xs text-gray-600">of $1.00 payout</div>
        </div>
      </div>

      {/* Question */}
      <h3 className="font-semibold text-sm text-gray-200 mb-3 leading-snug line-clamp-2">
        {o.question}
      </h3>

      {/* Match confidence bar */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-gray-600 w-20 shrink-0">Match confidence</span>
        <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-400"
            style={{ width: `${o.matchScore * 100}%` }}
          />
        </div>
        <span className="text-xs text-gray-500 w-8 text-right">{(o.matchScore * 100).toFixed(0)}%</span>
      </div>

      {/* The two trade legs */}
      <div className="flex gap-2">
        <TradeSide
          platform={o.buyYesOn}
          side="YES"
          price={o.yesPrice}
          url={o.marketA.url}
        />
        <TradeSide
          platform={o.buyNoOn}
          side="NO"
          price={o.noPrice}
          url={o.marketB.url}
        />
      </div>

      {/* Volume / expiry footer */}
      <div className="flex items-center justify-between mt-3 text-xs text-gray-600">
        <span>{PLATFORM_STYLE[o.marketA.platform].label} vol: {formatVolume(o.marketA.volume24h)}</span>
        {o.marketA.endDate && (
          <span>Exp. {new Date(o.marketA.endDate).toLocaleDateString()}</span>
        )}
        <span>{PLATFORM_STYLE[o.marketB.platform].label} vol: {formatVolume(o.marketB.volume24h)}</span>
      </div>

      {/* Fee breakdown — only on non-blurred confirmed opportunities */}
      {!isBlurred && !isNearMiss && (
        <div className="mt-2 text-[10px] text-gray-700 text-center">
          Est. taker fees: {(o.totalFeeEstimate * 100).toFixed(2)}¢
          {' '}· formula: 7%×P×(1−P) Kalshi + 6.25%×P×(1−P) Poly
        </div>
      )}

      {/* Execute button — only on confirmed opportunities, not near misses */}
      {onExecute && !isBlurred && !isNearMiss && (
        <button
          onClick={() => onExecute(o)}
          className="mt-3 w-full py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-500/60 text-amber-400 text-xs font-bold transition-all flex items-center justify-center gap-1.5"
        >
          <Zap className="w-3.5 h-3.5" />
          Execute Trade
        </button>
      )}

      {/* Paywall blur overlay */}
      {isBlurred && (
        <div className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center bg-[#0a0a0f]/80 backdrop-blur-sm">
          <Lock className="w-5 h-5 text-amber-400 mb-2" />
          <p className="text-sm font-semibold text-white mb-1">Pro opportunity</p>
          <p className="text-xs text-gray-400 mb-3">Upgrade to unlock all live arb alerts</p>
          <button
            onClick={onUpgrade}
            className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-sm font-bold text-black transition-colors"
          >
            Upgrade to Pro
          </button>
        </div>
      )}
    </div>
  );
}

export function ArbitrageCardSkeleton() {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-5 w-8 rounded bg-white/10" />
        <div className="h-5 w-28 rounded-full bg-white/10" />
      </div>
      <div className="h-4 w-3/4 rounded bg-white/10 mb-2" />
      <div className="h-4 w-1/2 rounded bg-white/10 mb-4" />
      <div className="flex gap-2">
        <div className="flex-1 h-24 rounded-xl bg-white/5" />
        <div className="flex-1 h-24 rounded-xl bg-white/5" />
      </div>
    </div>
  );
}
