'use client';

import { getUserProfile } from '@/utils/supabase/server/user';
import { ReactNode, Suspense, useEffect } from 'react';

type LayoutProps = {
  children: ReactNode;
};

export default function Layout({ children }: LayoutProps) {


  useEffect(() => {
    const fetchUserProfile = async () => {
      const { data, error } = await getUserProfile();

      if (error) {
        console.error("Error fetching user profile:", error);
        return;
      }

      if (typeof window !== "undefined") {
        window.userData = data;
      };
    }
    fetchUserProfile();
  }, []);
  
  return (
    <Suspense>
      {children}
    </Suspense>
  );
}
