import type { Metadata, Viewport } from "next";
import "./globals.css";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import SessionProviderWrapper from "../components/SessionProviderWrapper";
import SplashPWA from "../components/SplashPWA";

export const metadata: Metadata = {
  title: "Sismos",
  description: "Sismos de Chile y el mundo en tiempo real",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Sismos",
    statusBarStyle: "black-translucent",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <NextIntlClientProvider messages={messages}>
          <SplashPWA />
          <SessionProviderWrapper>{children}</SessionProviderWrapper>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
