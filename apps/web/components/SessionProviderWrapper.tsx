"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";
import AuthToastWatcher from "./auth/AuthToastWatcher";
import ActualizacionToastWatcher from "./ActualizacionToastWatcher";
import InvitacionNotificacionesToastWatcher from "./InvitacionNotificacionesToastWatcher";

export default function SessionProviderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <AuthToastWatcher />
      <ActualizacionToastWatcher />
      <InvitacionNotificacionesToastWatcher />
      <Toaster
        position="top-center"
        gap={8}
        // sonner usa variables CSS distintas para el offset según el ancho
        // de pantalla: `offset` solo llena --offset-top, que se usa arriba
        // de 600px. Debajo de eso (cualquier celular) usa --mobile-offset-*
        // en su lugar — sin `mobileOffset`, ese caso cae al default de la
        // librería e ignora el safe-area, quedando pegado al notch/status
        // bar. Van los dos con el mismo valor.
        offset={{ top: "calc(0.75rem + env(safe-area-inset-top))" }}
        mobileOffset={{ top: "calc(0.75rem + env(safe-area-inset-top))" }}
        // Por defecto sonner solo deja deslizar hacia arriba en toasts
        // centrados arriba ("top-center" se parsea como direcciones
        // ["top", "center"], y "center" no es una dirección real). Se
        // agrega deslizar a los costados como forma más natural de
        // descartar cualquier toast de la app con el pulgar.
        swipeDirections={["top", "left", "right"]}
      />
      {children}
    </SessionProvider>
  );
}
