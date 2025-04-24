import { ReactNode } from 'react';
import SideBar from '@/components/sidebar';
import NavigationBread from '@/components/breadcrumbs';

type LayoutProps = {
  children: ReactNode;
};


export default function Layout({ children }: LayoutProps) {
  return (
    <div className="flex h-screen max-w-screen-2xl mx-auto 2xl:p-5 transition-[padding] duration-300 ease-in-out">
      <div className='flex w-full 2xl:border-1 2xl:border-default-200 
        2xl:rounded-lg 2xl:shadow-2xl 2xl:shadow-primary/50 overflow-hidden' suppressHydrationWarning>
        {/* Sidebar */}
        <SideBar>
          <main className="flex-1 bg-default-100 relative w-full h-full">
            <div className="h-full ">
              <header className="absolute flex 
              items-center  border-b border-default-200 font-medium top-0 
              z-30 backdrop-blur-lg bg-default-50/80 
              w-[calc(100%+8rem)] h-[calc(4.5rem+4rem)] -mt-16 -mx-16 pr-18 pt-16 pl-32
              md:w-full md:m-0 md:h-[4.5rem]
              md:p-2  
            ">
                <NavigationBread />
              </header>
              <div className="p-4 overflow-auto w-full h-full pt-[5.5rem] z-10" suppressHydrationWarning>
                {/* Main content */}
                {children}
              </div>
            </div>
          </main>
        </SideBar>
      </div>
    </div>
  );
}