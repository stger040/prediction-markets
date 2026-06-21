import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Allow preflight CORS requests
  if (request.method === 'OPTIONS') return NextResponse.next();

  const expectedKey = process.env.MATCHER_API_KEY;

  // If no key is configured, only allow requests from localhost (dev mode)
  if (!expectedKey) {
    const host = request.headers.get('host') ?? '';
    if (!host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
      return NextResponse.json({ error: 'MATCHER_API_KEY not configured' }, { status: 500 });
    }
    return NextResponse.next();
  }

  const providedKey = request.headers.get('x-api-key');
  if (providedKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
