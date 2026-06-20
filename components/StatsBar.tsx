'use client';
import { Zap, AlertTriangle } from 'lucide-react';

interface StatsBarProps {
  platformACount: number;
  platformBCount: number;
  platformAName: string;
  platformBName: string;
  opportunityCount: number;
  usingDemoData: boolean;
}

const PLATFORM_DOT: Record<string, string> = {
  Polymarket: 'bg-purple-500',
  Kalshi: 'bg-green-500',
  'IBKR ForecastEx': 'bg-blue-500',
};

export function StatsBar({
  platformACount,
  platformBCount,
  platformAName,
  platformBName,
  opportunityCount,
  usingDemoData,
}: StatsBarProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 mb-6">
      <div className="grid grid-cols-3 divide-x divide-white/10">
        <div className="text-center px-4">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <div className={`w-2 h-2 rounded-full ${PLATFORM_DOT[platformAName] ?? 'bg-gray-500'}`} />
            <span className="text-xs text-gray-400">{platformAName}</span>
          </div>
          <div className="text-2xl font-black text-white">{platformACount}</div>
          <div className="text-xs text-gray-600">markets</div>
        </div>

        <div className="text-center px-4">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <Zap className="w-3 h-3 text-amber-400" />
            <span className="text-xs text-gray-400">Arb Found</span>
          </div>
          <div className="text-2xl font-black text-gradient-gold">{opportunityCount}</div>
          <div className="text-xs text-gray-600">opportunities</div>
        </div>

        <div className="text-center px-4">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <div className={`w-2 h-2 rounded-full ${PLATFORM_DOT[platformBName] ?? 'bg-gray-500'}`} />
            <span className="text-xs text-gray-400">{platformBName}</span>
          </div>
          <div className="text-2xl font-black text-white">{platformBCount}</div>
          <div className="text-xs text-gray-600">{usingDemoData ? 'demo' : 'live'}</div>
        </div>
      </div>

      {usingDemoData && (
        <div className="mt-3 pt-3 border-t border-white/10 flex items-start gap-2 text-xs text-amber-400/80">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>
            Showing demo data — prices are simulated. See the{' '}
            <code className="bg-white/10 px-1 rounded">.env.local.example</code>{' '}
            file for setup instructions to get live data.
          </span>
        </div>
      )}
    </div>
  );
}
