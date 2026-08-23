"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

export default function AuthToastWatcher() {
  const { data: session, status } = useSession();
  const estadoPrevio = useRef<typeof status | null>(null);

  useEffect(() => {
    const anterior = estadoPrevio.current;
    estadoPrevio.current = status;

    if (status === "loading" || anterior === null || anterior === status) {
      return;
    }

    if (anterior === "unauthenticated" && status === "authenticated") {
      const nombre = session?.user?.name ?? session?.user?.email ?? "";
      const imagen = session?.user?.image ?? null;
      toast.custom(() => (
        <div className="flex items-center gap-3 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 shadow-lg shadow-black/40">
          <span className="relative flex shrink-0">
            {imagen ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imagen}
                alt=""
                className="h-9 w-9 rounded-full ring-2 ring-emerald-400"
              />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-700 ring-2 ring-emerald-400">
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5 text-neutral-300"
                  fill="currentColor"
                >
                  <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.4 0-8 2.2-8 5v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1c0-2.8-3.6-5-8-5Z" />
                </svg>
              </span>
            )}
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-neutral-900 bg-emerald-400" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-100">
              Sesión iniciada
            </p>
            {nombre && (
              <p className="truncate text-xs text-neutral-400">{nombre}</p>
            )}
          </div>
        </div>
      ));
    }

    if (anterior === "authenticated" && status === "unauthenticated") {
      toast.custom(() => (
        <div className="flex items-center gap-3 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 shadow-lg shadow-black/40">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-800">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 text-neutral-400"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
          </span>
          <div>
            <p className="text-sm font-medium text-neutral-100">
              Sesión cerrada
            </p>
            <p className="text-xs text-neutral-400">Vuelve pronto 👋</p>
          </div>
        </div>
      ));
    }
  }, [status, session]);

  return null;
}
