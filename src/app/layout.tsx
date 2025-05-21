import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import SplashScreen from "@/components/splashscreen";

export const metadata: Metadata = {
  title: "Web Inventory",
  description: "Web Inventory Management System",
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en"
      suppressHydrationWarning
      className="2xl:bg-default-200 bg-default-100">
      <body suppressHydrationWarning className={`antialiased`}>
        <NextThemesProvider
          attribute="class"
          storageKey="heroui-theme"
          defaultTheme="system"
          themes={['dark', 'light', 'system']}>
          <Providers>
            <SplashScreen>
              {children}
            </SplashScreen> 
            {/* {children} */}
          </Providers>
        </NextThemesProvider>
      </body>
    </html>
  );
}