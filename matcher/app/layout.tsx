import type { ReactNode } from 'react';

export const metadata = {
  title: 'ArbScout Matcher',
  description: 'Prediction market matching and arbitrage calculation service',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
