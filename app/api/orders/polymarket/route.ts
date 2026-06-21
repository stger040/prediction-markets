import { NextResponse } from 'next/server';
import { placePolymarketOrder, fetchClobTokenIds } from '@/lib/polymarket-clob';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { conditionId, clobTokenId, side, price, contracts } = await request.json();

    if (!side || !price || !contracts) {
      return NextResponse.json({ error: 'Missing required fields: side, price, contracts' }, { status: 400 });
    }
    if (!['yes', 'no'].includes(side)) {
      return NextResponse.json({ error: 'side must be "yes" or "no"' }, { status: 400 });
    }

    // Resolve token ID: use provided one or look up by conditionId
    let tokenId: string = clobTokenId ?? '';
    if (!tokenId && conditionId) {
      const ids = await fetchClobTokenIds(conditionId);
      if (ids) tokenId = side === 'yes' ? ids[0] : ids[1];
    }
    if (!tokenId) {
      return NextResponse.json(
        { error: 'Could not resolve Polymarket token ID. Provide clobTokenId or conditionId.' },
        { status: 400 },
      );
    }

    const result = await placePolymarketOrder({ tokenId, side, price, contracts });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Polymarket order]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
