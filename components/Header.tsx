'use client';
import { TrendingUp, RefreshCw, Lock, LogOut } from 'lucide-react';

interface HeaderProps {
  lastUpdated: string | null;
  onRefresh: () => void;
  isLoading: boolean;
  isPro: boolean;
  isAdmin: boolean;
  onUpgrade: () => void;
}

export function Header({ lastUpdated, onRefresh, isLoading, isPro, isAdmin, onUpgrade }: HeaderProps) {
  async function handleSignOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0a0a0f]/90 backdrop-blur-md">
      <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/20">
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h1 className="font-bold text-base leading-none text-white">ArbScout</h1>
            <p className="text-[10px] text-gray-500 leading-none mt-0.5">Polymarket × Kalshi</p>
          </div>
          {isAdmin ? (
            <span className="ml-2 px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
              ADMIN
            </span>
          ) : isPro ? (
            <span className="ml-2 px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500 text-black">
              PRO
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="hidden sm:block text-xs text-gray-500">
              Updated {new Date(lastUpdated).toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-gray-300 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {isAdmin ? (
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-gray-400 hover:text-gray-200 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          ) : !isPro ? (
            <button
              onClick={onUpgrade}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-sm font-semibold text-black transition-colors"
            >
              <Lock className="w-3.5 h-3.5" />
              Upgrade
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
