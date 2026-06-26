import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({ password: '' }));
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword || !password || password !== adminPassword) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set('arb_session', adminPassword, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  });
  return res;
}
