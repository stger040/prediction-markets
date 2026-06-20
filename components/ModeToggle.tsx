'use client';
import { AppMode } from '@/lib/types';
import { ShieldCheck, Globe } from 'lucide-react';
import clsx from 'clsx';

interface ModeToggleProps {
  mode: AppMode;
  onChange: (mode: AppMode) => void;
}

const MODES = [
  {
    id: 'us' as AppMode,
    label: 'US Mode',
    sublabel: 'Kalshi × IBKR ForecastEx',
    icon: ShieldCheck,
    description: 'Legal for US citizens. Both platforms are CFTC-regulated.',
    iconColor: 'text-blue-400',
    activeClass: 'border-blue-500/60 bg-blue-500/10',
    badgeClass: 'bg-blue-500/20 text-blue-400',
  },
  {
    id: 'global' as AppMode,
    label: 'Global Mode',
    sublabel: 'Kalshi × Polymarket',
    icon: Globe,
    description: 'For users outside the US where Polymarket is accessible.',
    iconColor: 'text-purple-400',
    activeClass: 'border-purple-500/60 bg-purple-500/10',
    badgeClass: 'bg-purple-500/20 text-purple-400',
  },
];

export function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div className="grid grid-cols-2 gap-3 mb-6">
      {MODES.map(m => {
        const Icon = m.icon;
        const isActive = mode === m.id;
        return (
          <button
            key={m.id}
            onClick={() => onChange(m.id)}
            className={clsx(
              'relative rounded-2xl border p-4 text-left transition-all',
              isActive
                ? m.activeClass
                : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/20'
            )}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Icon className={clsx('w-4 h-4', isActive ? m.iconColor : 'text-gray-500')} />
              <span className={clsx('text-sm font-bold', isActive ? 'text-white' : 'text-gray-400')}>
                {m.label}
              </span>
              {isActive && (
                <span className={clsx('ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full', m.badgeClass)}>
                  ACTIVE
                </span>
              )}
            </div>
            <p className={clsx('text-xs font-semibold mb-0.5', isActive ? 'text-gray-300' : 'text-gray-500')}>
              {m.sublabel}
            </p>
            <p className="text-[11px] text-gray-600 leading-snug">
              {m.description}
            </p>
          </button>
        );
      })}
    </div>
  );
}
