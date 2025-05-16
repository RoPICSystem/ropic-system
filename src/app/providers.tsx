// app/providers.tsx
"use client";

import { useRouter } from "next/navigation";
import { HeroUIProvider, Spinner } from "@heroui/react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { ToastProvider } from "@heroui/toast";
import { herouiColor } from "@/utils/colors";
import { useEffect } from "react";
import { ShelfSelectorColors } from "@/components/shelf-selector-3d-v4";

// Only if using TypeScript
declare module "@react-types/shared" {
  interface RouterConfig {
    routerOptions: NonNullable<Parameters<ReturnType<typeof useRouter>["push"]>[1]>;
  }
}

declare global {
  interface Window {
    shelfSelectorColors?: ShelfSelectorColors;
    currentTheme?: string;
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { theme, resolvedTheme } = useTheme()
  const getDefaultTheme = () => {
    return {
      backgroundColor: herouiColor('primary-50', 'hex') as string,
      floorColor: herouiColor('primary-200', 'hex') as string,
      floorHighlightedColor: herouiColor('primary-300', 'hex') as string,
      groupColor: herouiColor('default', 'hex') as string,
      groupSelectedColor: herouiColor('primary', 'hex') as string,
      shelfColor: herouiColor('default-600', 'hex') as string,
      shelfHoverColor: herouiColor('primary-400', 'hex') as string,
      shelfSelectedColor: herouiColor('primary', 'hex') as string,
      occupiedShelfColor: herouiColor('danger', 'hex') as string,
      occupiedHoverShelfColor: herouiColor('danger-400', 'hex') as string,
      textColor: herouiColor('text', 'hex') as string,
    };
  }

  useEffect(() => {
    setTimeout(() => {
      window.shelfSelectorColors = getDefaultTheme();
    }, 100);

  }, []);

  useEffect(() => {
    setTimeout(() => {
      window.shelfSelectorColors = getDefaultTheme();
    }, 100);
    console.log('Theme changed:', theme);
    console.log('Resolved theme:', resolvedTheme);

    window.currentTheme = resolvedTheme;
  }, [theme])

  if (typeof window === "undefined") {
    return (
      <div className="flex items-center justify-center w-full h-screen">
        <div className="flex flex-col items-center justify-center">
          <Spinner size="lg" />
        </div>
      </div>
    );
  } else {
    window.shelfSelectorColors = getDefaultTheme();

    return <HeroUIProvider navigate={router.push}>
      <ToastProvider />
      {children}
    </HeroUIProvider>;
  }

}