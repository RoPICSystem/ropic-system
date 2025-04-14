'use client';

import { ReactNode,} from 'react';

type LayoutProps = {
  children: ReactNode;
};

export default function Layout({ children }: LayoutProps) {

  return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex max-w-screen-2xl w-screen m-auto 2xl:p-5 transition-[padding] duration-300 ease-in-out overflow-none">
          <main className="flex-1 overflow-hidden z-50 2xl:border-1 
            2xl:border-default-200 2xl:rounded-lg 2xl:shadow-2xl 2xl:shadow-primary/50  bg-default-100 relative w-full 2xl:max-h-[calc(100vh-3rem)]">
            {children}
          </main>
        </div>
      </div>
  );
}
