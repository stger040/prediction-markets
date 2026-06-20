'use client';
import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/Header';
import { ArbitrageCard, ArbitrageCardSkeleton } from '@/components/ArbitrageCard';
import { StatsBar } from '@/components/StatsBar';
import { UpgradeModal } from '@/components/UpgradeModal';
import { ArbitrageOpportunity } from '@/lib/types';
import { AlertCircle, TrendingUp } from 'lucide-react';

// Free tier users see the top 3 opportunities; rest are blurred
const FREE_TIER_LIMIT = 3;

interface ArbResponse {
  opportunities: ArbitrageOpportunity[];
  meta: {
    polymarketCount: number;
    kalshiCount: number;
    pairsFound: number;
    opportunitiesFound: number;
    usingDemoData: boolean;
    fetchedAt: string;
  };
  error?: string;
}

export default function Home() {
  const [data, setData] = useState<ArbResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [isPro] = useState(false); // Wire up to your auth/subscription system

  const fetchOpportunities = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/arbitrage');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ArbResponse = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOpportunities();
    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchOpportunities, 60_000);
    return () => clearInterval(interval);
  }, [fetchOpportunities]);

  const opportunities = data?.opportunities ?? [];
  const visibleOpportunities = isPro ? opportunities : opportunities;
  const skeletonCount = 5;

  return (
    <>
      <Header
        lastUpdated={data?.meta.fetchedAt ?? null}
        onRefresh={fetchOpportunities}
        isLoading={isLoading}
        isPro={isPro}
        onUpgrade={() => setShowUpgrade(true)}
      />

      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* Hero */}
        <div className="text-center mb-8">
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-2 leading-tight">
            Risk-Free Profits Across<br />
            <span className="text-gradient-gold">Prediction Markets</span>
          </h2>
          <p className="text-gray-400 text-sm sm:text-base max-w-lg mx-auto">
            ArbScout scans Polymarket and Kalshi every 30 seconds, matches the same events,
            and surfaces guaranteed-profit opportunities when prices diverge.
          </p>
        </div>

        {/* Stats */}
        {data && (
          <StatsBar
            polyCount={data.meta.polymarketCount}
            kalshiCount={data.meta.kalshiCount}
            opportunityCount={data.meta.opportunitiesFound}
            usingDemoData={data.meta.usingDemoData}
          />
        )}

        {/* Error state */}
        {error && (
          <div className="flex items-center gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 mb-6">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-300">Failed to load opportunities</p>
              <p className="text-xs text-red-400/70 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Opportunities list */}
        <div className="space-y-3">
          {isLoading && !data && (
            Array.from({ length: skeletonCount }).map((_, i) => (
              <ArbitrageCardSkeleton key={i} />
            ))
          )}

          {!isLoading && opportunities.length === 0 && !error && (
            <div className="text-center py-16">
              <TrendingUp className="w-10 h-10 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 font-semibold">No arbitrage opportunities found right now</p>
              <p className="text-gray-600 text-sm mt-1">Markets are efficiently priced. Check back soon.</p>
            </div>
          )}

          {visibleOpportunities.map((opp, idx) => (
            <ArbitrageCard
              key={opp.id}
              opportunity={opp}
              rank={idx + 1}
              isBlurred={!isPro && idx >= FREE_TIER_LIMIT}
              onUpgrade={() => setShowUpgrade(true)}
            />
          ))}
        </div>

        {/* Upgrade CTA after free tier */}
        {!isPro && opportunities.length > FREE_TIER_LIMIT && (
          <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 text-center">
            <p className="text-sm font-semibold text-white mb-1">
              {opportunities.length - FREE_TIER_LIMIT} more opportunities hidden
            </p>
            <p className="text-xs text-gray-400 mb-3">
              Upgrade to Pro to see all live alerts and never miss a trade.
            </p>
            <button
              onClick={() => setShowUpgrade(true)}
              className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-sm font-bold text-black transition-colors"
            >
              Unlock All Opportunities
            </button>
          </div>
        )}

        {/* How it works */}
        <div className="mt-12 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <h3 className="font-bold text-white mb-4">How arbitrage works</h3>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              {
                step: '1',
                title: 'Same event, different price',
                desc: 'Polymarket and Kalshi price the same real-world event independently. Small differences create gaps.',
              },
              {
                step: '2',
                title: 'Buy both sides',
                desc: 'Buy YES on the cheaper platform and NO on the other. Together they always pay out $1.',
              },
              {
                step: '3',
                title: 'Collect the spread',
                desc: 'If YES + NO costs less than $1, you profit no matter what happens. Zero directional risk.',
              },
            ].map(item => (
              <div key={item.step} className="flex gap-3">
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 text-xs font-black flex items-center justify-center">
                  {item.step}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white mb-0.5">{item.title}</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-gray-700 mt-8">
          ArbScout is for informational purposes. Always verify opportunities before trading. Fees reduce net profit.
        </p>
      </main>

      <UpgradeModal isOpen={showUpgrade} onClose={() => setShowUpgrade(false)} />
    </>
  );
}
