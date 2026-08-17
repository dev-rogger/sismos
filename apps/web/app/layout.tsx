import type { Metadata, Viewport } from "next";
import "./globals.css";
import SessionProviderWrapper from "../components/SessionProviderWrapper";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <SessionProviderWrapper>{children}</SessionProviderWrapper>
      </body>
    </html>
  );
}
