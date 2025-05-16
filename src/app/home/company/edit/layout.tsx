"use client";

import { redirect } from 'next/navigation';
import { ReactNode, useEffect } from 'react';

export default function CompanyEditLayout({
  children,
}: {
  children: ReactNode
}) {
  useEffect(() => {
    if (!window.userData?.is_admin) {
      redirect("/home/company");
    }
  }, []);
  return (
    <div className="w-full space-y-4">
      {children}
    </div>
  )
}