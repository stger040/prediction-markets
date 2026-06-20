'use client';
import { ExternalLink, TrendingUp, Lock, AlertCircle } from 'lucide-react';
import { ArbitrageOpportunity } from '@/lib/types';
import clsx from 'clsx';

interface ArbitrageCardProps {
  opportunity: ArbitrageOpportunity;
  rank: number;
  isBlurred: boolean;
  onUpgrade: () => void;
}

function ProfitBadge({ pct }: { pct: number }) {
  const color =
    pct >= 0.05 ? 'bg-red-500/20 text-red-400 border-red-500/30' :
    pct >= 0.02 ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
    'bg-green-500/20 text-green-400 border-green-500/30';

  return (
    <span className={clsx('px-2 py-0.5 rounded-full text-sm font-bold border', color)}>
      +{(pct * 100).toFixed(2)}% profit
    </span>
  );
}

function PlatformSide({
  platform,
  side,
  price,
  url,
}: {
  platform: 'polymarket' | 'kalshi';
  side: 'YES' | 'NO';
  price: number;
  url: string;
}) {
  const isKalshi = platform === 'kalshi';
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={clsx(
        'flex-1 rounded-xl p-3 border transition-all hover:scale-[1.01]',
        isKalshi
          ? 'bg-green-950/40 border-green-800/40 hover:border-green-600/60'
          : 'bg-purple-950/40 border-purple-800/40 hover:border-purple-600/60'
      )}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className={clsx(
          'text-xs font-bold px-2 py-0.5 rounded-full',
          isKalshi ? 'bg-green-500/20 text-green-400' : 'bg-purple-500/20 text-purple-400'
        )}>
          {isKalshi ? 'KALSHI' : 'POLYMARKET'}
        </span>
        <ExternalLink className="w-3 h-3 text-gray-500" />
      </div>
      <div className="text-center mt-2">
        <div className={clsx(
          'text-2xl font-black',
          side === 'YES' ? 'text-emerald-400' : 'text-rose-400'
        )}>
          BUY {side}
        </div>
        <div className="text-lg font-bold text-white mt-0.5">
          {(price * 100).toFixed(1)}¢
        </div>
        <div className="text-xs text-gray-500">
          implied {(price * 100).toFixed(0)}% probability
        </div>
      </div>
    </a>
  );
}

export function ArbitrageCard({ opportunity: o, rank, isBlurred, onUpgrade }: ArbitrageCardProps) {
  const yesSide: 'polymarket' | 'kalshi' = o.buyYesOn;
  const noSide: 'polymarket' | 'kalshi' = o.buyNoOn;

  return (
    <div className={clsx(
      'relative rounded-2xl border bg-white/[0.03] p-4 transition-all',
      isBlurred ? 'border-white/5' : 'border-white/10 hover:border-white/20',
    )}>
      {/* Rank badge */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-gray-600">#{rank}</span>
          <ProfitBadge pct={o.profitPct} />
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">combined cost</div>
          <div className="text-sm font-bold text-white">{(o.combinedCost * 100).toFixed(1)}¢</div>
        </div>
      </div>

      {/* Question */}
      <h3 className="font-semibold text-sm text-gray-200 mb-3 leading-snug line-clamp-2">
        {o.question}
      </h3>

      {/* Match confidence */}
      <div className="flex items-center gap-1.5 mb-3">
        <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-400"
            style={{ width: `${o.matchScore * 100}%` }}
          />
        </div>
        <span className="text-xs text-gray-500">{(o.matchScore * 100).toFixed(0)}% match</span>
      </div>

      {/* The two sides */}
      <div className="flex gap-2">
        <PlatformSide
          platform={yesSide}
          side="YES"
          price={o.yesPrice}
          url={yesSide === 'polymarket' ? o.polymarket.url : o.kalshi.url}
        />
        <PlatformSide
          platform={noSide}
          side="NO"
          price={o.noPrice}
          url={noSide === 'polymarket' ? o.polymarket.url : o.kalshi.url}
        />
      </div>

      {/* Volume info */}
      <div className="flex items-center justify-between mt-3 text-xs text-gray-600">
        <span>
          Poly vol: ${(o.polymarket.volume24h / 1000).toFixed(0)}k
        </span>
        <span>
          Expires {new Date(o.polymarket.endDate).toLocaleDateString()}
        </span>
        <span>
          Kalshi vol: ${(o.kalshi.volume24h / 1000).toFixed(0)}k
        </span>
      </div>

      {/* Blur overlay for non-pro users */}
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
        <div className="h-5 w-24 rounded-full bg-white/10" />
        <div className="h-5 w-16 rounded-full bg-white/10" />
      </div>
      <div className="h-4 w-3/4 rounded bg-white/10 mb-2" />
      <div className="h-4 w-1/2 rounded bg-white/10 mb-3" />
      <div className="flex gap-2">
        <div className="flex-1 h-24 rounded-xl bg-white/5" />
        <div className="flex-1 h-24 rounded-xl bg-white/5" />
      </div>
    </div>
  );
}
