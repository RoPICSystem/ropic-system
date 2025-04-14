'use client';

import { ReactNode, Suspense, useEffect, useState } from 'react';

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
