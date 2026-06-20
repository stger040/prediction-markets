'use client';
import { X, Check, Zap } from 'lucide-react';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRO_FEATURES = [
  'All live arbitrage opportunities (no limit)',
  'Real-time push alerts when new arb appears',
  'Filter by category, profit %, and exchange',
  'Expected value calculator with fee estimates',
  'Historical opportunity tracker',
  'API access for your own automation',
];

export function UpgradeModal({ isOpen, onClose }: UpgradeModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/20 bg-[#12121a] p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-500/20 mb-3">
            <Zap className="w-6 h-6 text-amber-400" />
          </div>
          <h2 className="text-xl font-black text-white mb-1">ArbScout Pro</h2>
          <p className="text-gray-400 text-sm">Never miss a risk-free profit opportunity</p>
        </div>

        <ul className="space-y-2.5 mb-6">
          {PRO_FEATURES.map(f => (
            <li key={f} className="flex items-start gap-2.5 text-sm text-gray-300">
              <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
              {f}
            </li>
          ))}
        </ul>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center mb-4">
          <div className="text-3xl font-black text-amber-400">$19<span className="text-base font-normal text-gray-400">/mo</span></div>
          <div className="text-xs text-gray-500 mt-0.5">Cancel any time. No commitment.</div>
        </div>

        <button className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 font-bold text-black text-sm transition-colors">
          Start 7-day Free Trial
        </button>
        <p className="text-center text-xs text-gray-600 mt-2">No credit card required for trial</p>
      </div>
    </div>
  );
}
