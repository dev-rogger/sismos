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

// Corre antes del primer paint: si la intro completa ya se vio en las últimas
// 12 horas, el CSS usa la versión corta (sin cinta ni ondas). Sin esto la
// marca llegaría tras hidratar y la intro larga ya habría empezado.
const SCRIPT_INTRO = `try{var t=+localStorage.getItem("sismos:intro-vista");if(t&&Date.now()-t<432e5)document.documentElement.dataset.intro="corta"}catch(e){}`;

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
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_INTRO }} />
        <NextIntlClientProvider messages={messages}>
          <SplashPWA />
          <SessionProviderWrapper>{children}</SessionProviderWrapper>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
