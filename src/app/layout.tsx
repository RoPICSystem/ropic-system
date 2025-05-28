import type { Metadata, Viewport } from "next";
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

export const viewport: Viewport = {
  viewportFit: "cover",
  width: "device-width",
  initialScale: 0.8,
  maximumScale: 0.8,
  userScalable: false,
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
            {children}
          </Providers>
        </NextThemesProvider>
      </body>
    </html>
  );
}