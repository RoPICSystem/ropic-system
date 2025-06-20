// app/providers.tsx
"use client";

import { ShelfSelectorColors } from "@/components/shelf-selector-3d";
import SplashScreen from "@/components/splashscreen";
import { motionTransition } from "@/utils/anim";
import { herouiColor } from "@/utils/colors";
import { HeroUIProvider, Spinner } from "@heroui/react";
import { ToastProvider } from "@heroui/toast";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
    resolveTheme?: string;
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { theme, resolvedTheme } = useTheme()
  // const [ adminTempData, setAdminTempData ] = useState<any>(null);

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
      secondaryShelfColor: herouiColor('secondary', 'hex') as string,
      secondaryShelfSelectedColor: herouiColor('secondary-300', 'hex') as string,
      tertiaryShelfColor: herouiColor('warning', 'hex') as string,
      tertiaryShelfSelectedColor: herouiColor('warning-300', 'hex') as string,
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
    window.currentTheme = theme;
  }, [theme])

  useEffect(() => {
    setTimeout(() => {
      window.shelfSelectorColors = getDefaultTheme();
    }, 100);
    window.resolveTheme = resolvedTheme;
  }, [resolvedTheme])


  return <HeroUIProvider navigate={router.push}>
    <ToastProvider
      toastProps={{
        shadow: "lg",
      }} />
    {children}
  </HeroUIProvider>

}