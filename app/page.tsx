'use client';
import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/Header';
import { ArbitrageCard, ArbitrageCardSkeleton } from '@/components/ArbitrageCard';
import { StatsBar } from '@/components/StatsBar';
import { ModeToggle } from '@/components/ModeToggle';
import { UpgradeModal } from '@/components/UpgradeModal';
import { AppMode, ArbApiResponse } from '@/lib/types';
import { AlertCircle, TrendingUp } from 'lucide-react';

const FREE_TIER_LIMIT = 3;

const API_ENDPOINT: Record<AppMode, string> = {
  us: '/api/arbitrage/ibkr',
  global: '/api/arbitrage',
};

const MODE_DESCRIPTION: Record<AppMode, string> = {
  us: 'Scanning Kalshi and IBKR ForecastEx — both CFTC-regulated, legal for US citizens.',
  global: 'Scanning Kalshi and Polymarket — for users outside the US where Polymarket is accessible.',
};

export default function Home() {
  const [mode, setMode] = useState<AppMode>('global');
  const [data, setData] = useState<ArbApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [isPro] = useState(false); // Replace with real auth check

  const fetchOpportunities = useCallback(async (currentMode: AppMode) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(API_ENDPOINT[currentMode]);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ArbApiResponse = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Re-fetch when mode changes
  useEffect(() => {
    setData(null);
    fetchOpportunities(mode);
    const interval = setInterval(() => fetchOpportunities(mode), 60_000);
    return () => clearInterval(interval);
  }, [mode, fetchOpportunities]);

  const opportunities = data?.opportunities ?? [];

  return (
    <>
      <Header
        lastUpdated={data?.meta.fetchedAt ?? null}
        onRefresh={() => fetchOpportunities(mode)}
        isLoading={isLoading}
        isPro={isPro}
        onUpgrade={() => setShowUpgrade(true)}
      />

      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* Hero */}
        <div className="text-center mb-6">
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-2 leading-tight">
            Risk-Free Profits Across<br />
            <span className="text-gradient-gold">Prediction Markets</span>
          </h2>
          <p className="text-gray-400 text-sm sm:text-base max-w-lg mx-auto">
            ArbScout scans two platforms every 30 seconds, matches the same events using
            AI-powered fuzzy matching, and ranks guaranteed-profit opportunities by return %.
          </p>
        </div>

        {/* Mode toggle */}
        <ModeToggle mode={mode} onChange={setMode} />

        {/* Mode description */}
        <p className="text-xs text-gray-500 text-center -mt-2 mb-5">
          {MODE_DESCRIPTION[mode]}
        </p>

        {/* Stats */}
        {data?.meta && (
          <StatsBar
            platformACount={data.meta.platformACount}
            platformBCount={data.meta.platformBCount}
            platformAName={data.meta.platformAName}
            platformBName={data.meta.platformBName}
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
            Array.from({ length: 4 }).map((_, i) => <ArbitrageCardSkeleton key={i} />)
          )}

          {!isLoading && opportunities.length === 0 && !error && (
            <div className="text-center py-16">
              <TrendingUp className="w-10 h-10 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 font-semibold">No arbitrage opportunities right now</p>
              <p className="text-gray-600 text-sm mt-1">
                Markets are efficiently priced at the moment. Gaps appear and close quickly — check back soon.
              </p>
            </div>
          )}

          {opportunities.map((opp, idx) => (
            <ArbitrageCard
              key={opp.id}
              opportunity={opp}
              rank={idx + 1}
              isBlurred={!isPro && idx >= FREE_TIER_LIMIT}
              onUpgrade={() => setShowUpgrade(true)}
            />
          ))}
        </div>

        {/* Upgrade CTA */}
        {!isPro && opportunities.length > FREE_TIER_LIMIT && (
          <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 text-center">
            <p className="text-sm font-semibold text-white mb-1">
              {opportunities.length - FREE_TIER_LIMIT} more opportunities are hidden
            </p>
            <p className="text-xs text-gray-400 mb-3">
              Upgrade to Pro to see all live alerts in real time.
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
          <h3 className="font-bold text-white mb-4">How prediction market arbitrage works</h3>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              {
                step: '1',
                title: 'Same event, different price',
                desc: 'Two separate platforms price the same real-world question independently. Trader pools don\'t overlap, so small price differences appear.',
              },
              {
                step: '2',
                title: 'Buy both sides',
                desc: 'Buy YES on the cheaper platform and NO on the other. One of them always resolves to $1. You hold both — zero directional risk.',
              },
              {
                step: '3',
                title: 'Collect the spread',
                desc: 'If YES + NO costs less than $1 total, the difference is pure profit. The outcome doesn\'t matter — you win either way.',
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

        <p className="text-center text-xs text-gray-700 mt-8 pb-8">
          ArbScout is for informational purposes only. Always verify prices before trading.
          Transaction fees reduce net profit — factor them in before executing.
        </p>
      </main>

      <UpgradeModal isOpen={showUpgrade} onClose={() => setShowUpgrade(false)} />
    </>
  );
}
