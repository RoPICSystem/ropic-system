"use client";

import { getUserFromCookies } from '@/utils/supabase/server/user';
import { redirect } from 'next/navigation';
import { ReactNode, useEffect } from 'react';

export default function CompanyEditLayout({
  children,
}: {
  children: ReactNode
}) {
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
    <div className="w-full space-y-4">
      {children}
    </div>
  )
}