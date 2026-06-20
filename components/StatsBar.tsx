'use client';
import { TrendingUp, Search, Zap } from 'lucide-react';

interface StatsBarProps {
  polyCount: number;
  kalshiCount: number;
  opportunityCount: number;
  usingDemoData: boolean;
}

export function StatsBar({ polyCount, kalshiCount, opportunityCount, usingDemoData }: StatsBarProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 mb-6">
      <div className="grid grid-cols-3 divide-x divide-white/10">
        <div className="text-center px-4">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <div className="w-2 h-2 rounded-full bg-purple-500" />
            <span className="text-xs text-gray-400">Polymarket</span>
          </div>
          <div className="text-2xl font-black text-white">{polyCount}</div>
          <div className="text-xs text-gray-600">live markets</div>
        </div>

        <div className="text-center px-4">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <Zap className="w-3 h-3 text-amber-400" />
            <span className="text-xs text-gray-400">Opportunities</span>
          </div>
          <div className="text-2xl font-black text-gradient-gold">{opportunityCount}</div>
          <div className="text-xs text-gray-600">arb found</div>
        </div>

        <div className="text-center px-4">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs text-gray-400">Kalshi</span>
          </div>
          <div className="text-2xl font-black text-white">{kalshiCount}</div>
          <div className="text-xs text-gray-600">{usingDemoData ? 'demo markets' : 'live markets'}</div>
        </div>
      </div>

      {usingDemoData && (
        <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-2 text-xs text-amber-400/80">
          <Search className="w-3.5 h-3.5 flex-shrink-0" />
          <span>
            Kalshi showing demo data. Add <code className="bg-white/10 px-1 rounded">KALSHI_EMAIL</code> and{' '}
            <code className="bg-white/10 px-1 rounded">KALSHI_PASSWORD</code> to .env.local for live data.
          </span>
        </div>
      )}
    </div>
  );
}
