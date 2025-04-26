'use client';

import { ReactNode, Suspense } from 'react';

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
