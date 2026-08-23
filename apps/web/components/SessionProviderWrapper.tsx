"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";
import AuthToastWatcher from "./auth/AuthToastWatcher";

export default function SessionProviderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <AuthToastWatcher />
      <Toaster position="top-center" gap={8} />
      {children}
    </SessionProvider>
  );
}
