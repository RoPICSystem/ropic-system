'use client';

import { getUserFromCookies } from '@/utils/supabase/server/user';
import { redirect } from 'next/navigation';
import { ReactNode, Suspense, useEffect } from 'react';

type LayoutProps = {
  children: ReactNode;
};

export default function Layout({ children }: LayoutProps) {
  useEffect(() => {
    const fetchSubscriptionData = async () => {
      const userData = await getUserFromCookies();
      if (userData === null || userData.is_admin === null) {
        redirect("/home/company");
      }
    }
    fetchSubscriptionData();
  }, []);
  return (
    <Suspense>
      {children}
    </Suspense>
  );
}
