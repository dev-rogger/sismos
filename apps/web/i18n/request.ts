import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

const LOCALES = ["es", "en"] as const;
export type Locale = (typeof LOCALES)[number];
const LOCALE_DEFAULT: Locale = "es";
export const CLAVE_COOKIE_IDIOMA = "NEXT_LOCALE";

// Sin cookie todavía: se mira el Accept-Language del navegador. Solo el inglés
// desvía del default, cualquier otro idioma cae en español.
function detectarLocaleInicial(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return LOCALE_DEFAULT;
  return acceptLanguage.toLowerCase().startsWith("en") ? "en" : LOCALE_DEFAULT;
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(CLAVE_COOKIE_IDIOMA)?.value;
  const locale: Locale =
    cookieLocale && LOCALES.includes(cookieLocale as Locale)
      ? (cookieLocale as Locale)
      : detectarLocaleInicial((await headers()).get("accept-language"));

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
