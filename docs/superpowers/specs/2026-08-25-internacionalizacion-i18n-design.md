# Internacionalización (español/inglés) — design

## Contexto

Todo el copy de `apps/web` está hoy hardcodeado en JSX/TSX, en español. El
usuario pidió extraer todos los textos a un diccionario para poder agregar
inglés sin tocar componentes uno por uno, y confirmó que quiere el alcance
completo ahora: no solo la extracción, sino inglés funcionando con un
selector de idioma en el sitio (2026-08-24/25).

Motivación explícita: facilitar mantener el copy consistente (ver
[[feedback_espanol_chileno]] — nada de voseo argentino, español neutro) y
abrir la app a usuarios que no leen español.

## Alcance

1. Extraer todo el texto visible de usuario (~25 archivos con copy hoy) a
   diccionarios de mensajes, namespaced por dominio.
2. Español e inglés funcionando de punta a punta, incluyendo `/admin`
   (Server Components).
3. Selector de idioma como ítem propio en el menú lateral.
4. Persistencia del idioma en cookie (no `localStorage`) — el servidor
   debe saber el idioma desde el primer render, sin parpadeo
   español→inglés del lado del cliente.
5. Detección inicial (sin cookie todavía): `Accept-Language` del
   navegador; si no matchea inglés, cae a español por default.

Fuera de alcance: rutas por idioma (`/es`, `/en`) — no hay necesidad de
SEO multi-idioma para una app-herramienta como esta (ver comparación de
enfoques más abajo); más idiomas que español/inglés; traducir contenido
que viene de APIs externas (nombres de lugares de USGS/CSN quedan como
vienen).

## Enfoque elegido: `next-intl` sin routing por idioma

Se evaluaron tres opciones:

- **Custom liviano** (Context + diccionarios TS tipados a mano): cero
  dependencias nuevas, pero hay que resolver plurales/formato de fecha a
  mano.
- **`next-intl` sin rutas por idioma** — elegido. Librería estándar para
  Next.js App Router, mensajes en JSON con formato ICU (plurales, fechas,
  números resueltos automáticamente por locale), sin restructurar las
  rutas existentes.
- **`next-intl` con rutas `/es`/`/en`**: el enfoque "correcto" para sitios
  de contenido con SEO multi-idioma, pero implica mover todo `app/` bajo
  `[locale]` (incluyendo login, admin, API routes, que normalmente NO
  deberían ir bajo `[locale]`), más middleware de detección/redirect, y
  más superficie de riesgo sobre el service worker de la PWA (Serwist).
  Sobre-ingeniería para una app-herramienta sin necesidad de SEO
  multi-idioma.

## Diseño

### Dependencia y configuración base

```
pnpm --filter web add next-intl
```

`apps/web/i18n/request.ts` (nuevo, usado por `next-intl` en modo sin
routing):

```ts
import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

const LOCALES = ["es", "en"] as const;
type Locale = (typeof LOCALES)[number];
const LOCALE_DEFAULT: Locale = "es";
const CLAVE_COOKIE = "NEXT_LOCALE";

function detectarLocaleInicial(aceptLanguage: string | null): Locale {
  if (!aceptLanguage) return LOCALE_DEFAULT;
  return aceptLanguage.toLowerCase().startsWith("en") ? "en" : LOCALE_DEFAULT;
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(CLAVE_COOKIE)?.value;
  const locale =
    cookieLocale && LOCALES.includes(cookieLocale as Locale)
      ? (cookieLocale as Locale)
      : detectarLocaleInicial((await headers()).get("accept-language"));

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
```

`next.config.ts`: envolver con `createNextIntlPlugin()` (de `next-intl/plugin`), sumado al `withSerwistInit` ya existente.

### `apps/web/app/layout.tsx`

Pasa a ser `async`, lee `locale` con `getLocale()` de `next-intl/server`, y
envuelve `children` en `NextIntlClientProvider` (mensajes ya resueltos por
`getRequestConfig`, no hace falta pasarlos a mano). `<html lang={locale}>`
en vez del `"es"` hardcodeado actual.

### Estructura de mensajes

`apps/web/messages/es.json` y `apps/web/messages/en.json`, namespaces por
dominio (calcan la carpeta de componentes):

```json
{
  "menu": {
    "sismos": "Sismos",
    "fallas": "Fallas",
    "notificaciones": "Notificaciones",
    "compartir": "Compartir",
    "idioma": "Idioma"
  },
  "instalar": {
    "titulo": "Instala la app",
    "queEsPwa": "Una PWA es una app web que se instala como una app normal: ícono propio, pantalla completa y notificaciones.",
    "queUsas": "¿Qué estás usando? Te mostramos los pasos para tu dispositivo."
  },
  "historial": {
    "resultado": "{n, plural, one {# sismo} other {# sismos}}",
    "sinResultados": "Sin sismos para estos filtros"
  }
}
```

Namespaces previstos: `menu`, `filtro`, `historial`, `configuracion`,
`instalar`, `login`, `admin`, `mapa`, `splash`, `compartir`, `comun`
(strings compartidos tipo "Cerrar", "Volver", "Entendido").

Al escribir `es.json`, seguir [[feedback_espanol_chileno]]: conjugación
"tú", sin voseo, sin modismos chilenos — español neutro correcto.

### Uso en componentes cliente

```tsx
"use client";
import { useTranslations } from "next-intl";

export default function MenuLateral(/* ... */) {
  const t = useTranslations("menu");
  // ...
  return <button>{t("sismos")}</button>;
}
```

Para strings con interpolación/plurales: `t("resultado", { n: eventosFiltrados.length })`.

### Uso en `/admin` (Server Components)

```tsx
import { getTranslations } from "next-intl/server";

export default async function UsuariosPage() {
  const t = await getTranslations("admin");
  // ...
}
```

### Selector de idioma (`MenuLateral.tsx`)

Nuevo ítem en el menú (namespace `menu.idioma`), toggle simple
"Español/English" — no un dropdown con banderas, coherente con el resto
del menú (texto + ícono). Server Action chica:

```ts
"use server";
import { cookies } from "next/headers";

export async function cambiarIdioma(locale: "es" | "en") {
  (await cookies()).set("NEXT_LOCALE", locale, { maxAge: 60 * 60 * 24 * 365 });
}
```

El botón del menú llama la Server Action y sigue con
`router.refresh()` (de `next/navigation`) para re-renderizar con el nuevo
locale sin recargar toda la app ni afectar el service worker.

### Migración (orden de trabajo)

1. Instalar `next-intl`, armar `i18n/request.ts`, `layout.tsx`, y
   `messages/es.json` vacío/mínimo — la app debe seguir funcionando
   igual que hoy, 100% en español, antes de tocar componentes.
2. Migrar namespace por namespace (empezando por `mapa`/`menu`, que son
   los más usados) reemplazando strings hardcodeados por
   `useTranslations`/`getTranslations`, moviendo cada string a
   `es.json` a medida que se toca su componente.
3. Con `es.json` completo y la app verificada en español, traducir todo
   a `en.json`.
4. Agregar el ítem de idioma al menú y la Server Action.

## Testing / verificación

- `tsc --noEmit` y `eslint --max-warnings 0` en cada fase.
- Pasada visual en el navegador alternando español/inglés en las
  pantallas principales: mapa (botones flotantes, popup de sismo),
  menú, historial, filtro, configuración/notificaciones, instalar app,
  login, admin.
- Confirmar que cambiar de idioma no rompe el estado de la sesión
  (sismo seleccionado, filtros activos) ni dispara un refetch
  innecesario de datos — solo debe cambiar el texto.
- Confirmar que el service worker (Serwist) sigue sirviendo bien tras el
  `router.refresh()` del cambio de idioma (misma URL, sin ruta nueva).
- Verificar `next build` completo (con la salvedad ya conocida de que
  `/admin/usuarios` falla localmente por DB no disponible en este
  entorno — no relacionado a este cambio).
