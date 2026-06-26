import { cookies } from 'next/headers';
import HomeClient from '@/components/HomeClient';

export default function Home() {
  const cookieStore = cookies();
  const session     = cookieStore.get('arb_session')?.value;
  const adminPwd    = process.env.ADMIN_PASSWORD;
  const isAdmin     = !!(adminPwd && session === adminPwd);
  return <HomeClient isAdmin={isAdmin} />;
}
