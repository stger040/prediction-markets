import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        poly: {
          purple: '#7B3FE4',
          light: '#A875FF',
        },
        kalshi: {
          green: '#00C805',
          dark: '#0B4F2D',
        },
        arb: {
          gold: '#F59E0B',
          hot: '#EF4444',
          warm: '#F97316',
          cool: '#22C55E',
        },
      },
    },
  },
  plugins: [],
};

export default config;
