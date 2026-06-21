import { NextResponse } from 'next/server';
import { placeKalshiOrder } from '@/lib/kalshi';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { ticker, side, contracts, priceCents } = await request.json();

    if (!ticker || !side || !contracts || priceCents === undefined) {
      return NextResponse.json({ error: 'Missing required fields: ticker, side, contracts, priceCents' }, { status: 400 });
    }
    if (!['yes', 'no'].includes(side)) {
      return NextResponse.json({ error: 'side must be "yes" or "no"' }, { status: 400 });
    }

    const result = await placeKalshiOrder({ ticker, side, contracts, priceCents });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Kalshi order]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
