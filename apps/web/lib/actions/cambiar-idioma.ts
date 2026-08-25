"use server";

import { cookies } from "next/headers";
import { CLAVE_COOKIE_IDIOMA, type Locale } from "../../i18n/request";

export async function cambiarIdioma(locale: Locale) {
  (await cookies()).set(CLAVE_COOKIE_IDIOMA, locale, {
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
}
