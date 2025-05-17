'use client';

import { redirect } from 'next/navigation';
import { ReactNode, Suspense, useEffect } from 'react';

type LayoutProps = {
  children: ReactNode;
};

export default function Layout({ children }: LayoutProps) {
  useEffect(() => {
    if (!window.userData?.is_admin) {
      redirect("/home/dashboard");
    }
  }, []);

  return (
    <Suspense>
      {children}
    </Suspense>
  );
}
