'use client';

import { getUserProfile } from '@/utils/supabase/server/user';
import { ReactNode, Suspense, useEffect } from 'react';

type LayoutProps = {
  children: ReactNode;
};

export default function Layout({ children }: LayoutProps) {
  
  return (
    <Suspense>
      {children}
    </Suspense>
  );
}
