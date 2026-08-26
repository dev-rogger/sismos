"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";
import AuthToastWatcher from "./auth/AuthToastWatcher";
import ActualizacionToastWatcher from "./ActualizacionToastWatcher";

export default function SessionProviderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <AuthToastWatcher />
      <ActualizacionToastWatcher />
      <Toaster
        position="top-center"
        gap={8}
        offset={{ top: "calc(0.75rem + env(safe-area-inset-top))" }}
      />
      {children}
    </SessionProvider>
  );
}
