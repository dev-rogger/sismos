import { getRequestConfig } from "next-intl/server";

// El locale queda fijo en "es" hasta que la migración completa (Tarea 12)
// agregue detección real de idioma + cookie. Ver "Global Constraints" en
// el plan: así cada tarea intermedia se puede deployar sin riesgo de que
// un visitante en inglés reciba una mezcla de idiomas.
export default getRequestConfig(async () => {
  const locale = "es";
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
