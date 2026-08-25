# Internacionalización (español/inglés) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extraer todo el copy visible de `apps/web` a diccionarios de mensajes con `next-intl`, con español e inglés funcionando de punta a punta y un selector de idioma en el menú.

**Architecture:** `next-intl` en modo sin routing por idioma (sin `[locale]` en las URLs). El locale se resuelve en `apps/web/i18n/request.ts` (server-side), se persiste en la cookie `NEXT_LOCALE`, y se expone a los componentes cliente vía `NextIntlClientProvider` en `app/layout.tsx`. Los componentes migran namespace por namespace desde JSX hardcodeado a `useTranslations()`/`getTranslations()`, sin tocar rutas ni el service worker.

**Tech Stack:** Next.js 16 App Router, React 19, `next-intl` (nuevo), TypeScript, Tailwind v4. Sin librería de testing en `apps/web` — la verificación de cada tarea es `tsc --noEmit` + `eslint --max-warnings 0` + revisión visual en el navegador (Chrome, dev server en :3000), siguiendo el patrón ya establecido en este proyecto.

**Spec:** `docs/superpowers/specs/2026-08-25-internacionalizacion-i18n-design.md`

## Global Constraints

- Español neutro sin voseo argentino, sin modismos chilenos — ver `docs/superpowers/specs/2026-08-25-internacionalizacion-i18n-design.md` y la memoria del proyecto sobre esto. Aplica a todo `es.json`.
- No usar rutas `/es`/`/en` — todas las URLs existentes quedan igual.
- El nombre de marca **"Sismos"** (título de la app, splash, metadata) se mantiene igual en ambos idiomas — es un nombre propio, no se traduce a "Earthquakes".
- Las etiquetas del propio selector de idioma ("Español" / "English") NO van en el diccionario de traducciones — son nombres de idioma que siempre se muestran en su propio idioma, se hardcodean como constante.
- Hasta la Tarea 12 (inclusive las tareas 1-11), el locale queda **fijo en `"es"`** — sin detección de `Accept-Language` ni cookie todavía. Esto es una decisión de seguridad de implementación (no está en el spec original palabra por palabra, pero se deriva de él): así cada tarea intermedia se puede deployar a producción sin riesgo de que un visitante con navegador en inglés reciba una mezcla de español/inglés mientras `en.json` todavía está incompleto. La detección real de idioma y el selector se agregan recién en la Tarea 12, cuando `en.json` ya está completo.
- Cada tarea que migra un componente debe extraer el texto **exacto** que existe hoy en el archivo (copiarlo tal cual al JSON) — no reescribirlo ni "mejorarlo" de paso. Si el texto actual tiene un problema (ej. voseo que ya se corrigió en una sesión anterior), ya debería estar bien; si accidentalmente encuentras voseo que quedó sin corregir, corrígelo al moverlo al JSON y anótalo en el commit.

---

## File Structure

**Nuevos:**
- `apps/web/i18n/request.ts` — resuelve el locale y carga los mensajes (server-side, usado por `next-intl`).
- `apps/web/messages/es.json` — diccionario en español, namespaced por dominio.
- `apps/web/messages/en.json` — diccionario en inglés (se llena recién en la Tarea 12).
- `apps/web/lib/actions/cambiar-idioma.ts` — Server Action que setea la cookie `NEXT_LOCALE` (Tarea 12).

**Modificados (progresivamente, uno o pocos por tarea):**
- `apps/web/next.config.ts` — envolver con el plugin de `next-intl`.
- `apps/web/app/layout.tsx` — async, `NextIntlClientProvider`, metadata dinámica.
- `apps/web/components/menu/MenuLateral.tsx`
- `apps/web/components/mapa/MapaSismos.tsx`, `BotonFiltroMapa.tsx`, `BotonFallasMapa.tsx`, `ModalFiltroMapa.tsx`
- `apps/web/components/filtro/SelectorMagnitudRangos.tsx`
- `apps/web/components/historial/ListaHistorial.tsx`, `PanelHistorial.tsx`, `PantallaHistorial.tsx`
- `apps/web/components/configuracion/ModalConfiguracion.tsx`
- `apps/web/components/instalar/ModalInstalarApp.tsx`
- `apps/web/components/fallas/PantallaFallas.tsx`
- `apps/web/components/SplashPWA.tsx`
- `apps/web/lib/use-compartir.tsx`
- `apps/web/app/login/page.tsx`
- `apps/web/app/admin/layout.tsx`, `apps/web/app/admin/usuarios/page.tsx`, `apps/web/app/admin/reportes/page.tsx`
- `apps/web/components/auth/AuthToastWatcher.tsx`

**Namespaces del diccionario** (cada uno corresponde a una tarea de migración): `comun`, `menu`, `mapa`, `filtro`, `historial`, `configuracion`, `instalar`, `fallas`, `splash`, `compartir`, `login`, `admin`, `auth`.

---

### Task 1: Infraestructura de `next-intl` (sin tocar componentes todavía)

**Files:**
- Create: `apps/web/i18n/request.ts`
- Create: `apps/web/messages/es.json`
- Modify: `apps/web/next.config.ts`
- Modify: `apps/web/app/layout.tsx`

**Interfaces:**
- Produces: `apps/web/messages/es.json` con namespace `comun` (`cerrar`, `volver`, `entendido`, `ahoraNo`, `guardar`) — las tareas siguientes agregan sus propios namespaces a este mismo archivo.
- Produces: `apps/web/i18n/request.ts` exporta un default de `getRequestConfig` que devuelve `{ locale: "es", messages }` — las tareas siguientes no tocan este archivo hasta la Tarea 12.

- [ ] **Step 1: Instalar `next-intl`**

```bash
cd apps/web && pnpm add next-intl
```

- [ ] **Step 2: Crear `apps/web/messages/es.json`**

```json
{
  "comun": {
    "cerrar": "Cerrar",
    "volver": "Volver",
    "entendido": "Entendido",
    "ahoraNo": "Ahora no",
    "guardar": "Guardar"
  }
}
```

- [ ] **Step 3: Crear `apps/web/i18n/request.ts`**

```ts
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
```

- [ ] **Step 4: Envolver `apps/web/next.config.ts` con el plugin de `next-intl`**

Lee el archivo actual completo antes de editar (ya envuelve con `withSerwistInit`) y agrega `createNextIntlPlugin` como una envoltura adicional, componiendo ambos plugins:

```ts
import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import createNextIntlPlugin from "next-intl/plugin";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
});
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {};

export default withNextIntl(withSerwist(nextConfig));
```

- [ ] **Step 5: Migrar `apps/web/app/layout.tsx` a async + `NextIntlClientProvider` + metadata dinámica**

Reemplaza el archivo completo (ya lo leíste en el contexto de la sesión: hoy exporta `metadata`/`viewport` estáticos y un `RootLayout` síncrono con `<html lang="es">` hardcodeado):

```tsx
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
        <NextIntlClientProvider messages={messages}>
          <SplashPWA />
          <SessionProviderWrapper>{children}</SessionProviderWrapper>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

(La `metadata` del título/descripción de la app queda igual por ahora — es el nombre de marca, no se traduce, ver "Global Constraints".)

- [ ] **Step 6: Verificar**

```bash
cd apps/web && npx tsc --noEmit && npx eslint --max-warnings 0
```
Expected: ambos limpios.

Levanta el dev server (`pnpm --filter web dev`) y confirma en el navegador que la app carga exactamente igual que antes (mapa, menú, todo en español, sin errores en consola) — este task no debe cambiar nada visible.

- [ ] **Step 7: Commit**

```bash
git add apps/web/i18n/request.ts apps/web/messages/es.json apps/web/next.config.ts apps/web/app/layout.tsx
git commit -m "feat(web): scaffolding de next-intl (sin migrar componentes todavía)"
```

---

### Task 2: Namespace `menu` — `MenuLateral.tsx`

**Files:**
- Modify: `apps/web/components/menu/MenuLateral.tsx`
- Modify: `apps/web/messages/es.json`

**Interfaces:**
- Consumes: namespace `comun` (Tarea 1).
- Produces: namespace `menu` en `es.json` — usado también por la Tarea 12 (selector de idioma agrega `menu.idioma`, no lo agregues ahora).

- [ ] **Step 1: Leer el archivo actual completo**

Lee `apps/web/components/menu/MenuLateral.tsx` completo antes de editar — confirma el texto exacto de cada string visible (los ítems "Sismos", "Fallas", "Notificaciones", "Compartir"/"Enlace copiado", el submenú Admin con "Usuarios"/"Reportes", el submenú de cuenta, "Instalar app", y cualquier mensaje de error) y sus `aria-label`.

- [ ] **Step 2: Agregar el namespace `menu` a `apps/web/messages/es.json`**

Usa el texto exacto que leíste en el Step 1. Como mínimo (agrega las claves que falten según lo que encuentres):

```json
{
  "comun": { "...": "..." },
  "menu": {
    "titulo": "Menú",
    "abrirMenu": "Abrir menú",
    "cerrarMenu": "Cerrar menú",
    "sismos": "Sismos",
    "fallas": "Fallas",
    "notificaciones": "Notificaciones",
    "admin": "Admin",
    "usuarios": "Usuarios",
    "reportes": "Reportes",
    "instalarApp": "Instalar app"
  }
}
```

El texto de "Compartir"/"Enlace copiado" NO va acá — pertenece al namespace `compartir` (Tarea 8), que este componente va a consumir además de `menu`.

- [ ] **Step 3: Migrar el componente**

Patrón a aplicar en cada string estático del archivo:

```tsx
// antes
<h2 className="text-base font-semibold text-neutral-100">Menú</h2>

// después
"use client";
import { useTranslations } from "next-intl";
// ...dentro del componente:
const t = useTranslations("menu");
const tc = useTranslations("comun");
// ...
<h2 className="text-base font-semibold text-neutral-100">{t("titulo")}</h2>
```

Aplica el mismo patrón `t("clave")` a cada string del archivo usando las claves que definiste en el Step 2 (`menu.*` para lo propio de este componente, `comun.cerrar`/`comun.volver` para los genéricos que ya vienen de la Tarea 1). Los `aria-label` también se migran (ej. `aria-label={t("abrirMenu")}`).

- [ ] **Step 4: Verificar**

```bash
cd apps/web && npx tsc --noEmit && npx eslint --max-warnings 0
```

En el navegador: abre el menú, confirma que todos los textos se ven idénticos a antes (nada en blanco, ninguna clave sin resolver tipo `menu.sismos` mostrada literal en pantalla — si ves eso, la clave no matchea entre el componente y el JSON).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/menu/MenuLateral.tsx apps/web/messages/es.json
git commit -m "feat(web): migra MenuLateral a next-intl (namespace menu)"
```

---

### Task 3: Namespaces `mapa` + `filtro`

**Files:**
- Modify: `apps/web/components/mapa/MapaSismos.tsx`, `BotonFiltroMapa.tsx`, `BotonFallasMapa.tsx`, `ModalFiltroMapa.tsx`
- Modify: `apps/web/components/filtro/SelectorMagnitudRangos.tsx`
- Modify: `apps/web/messages/es.json`

**Interfaces:**
- Consumes: `comun`.
- Produces: namespaces `mapa` y `filtro` en `es.json`.

- [ ] **Step 1: Leer los cinco archivos completos**

Confirma el texto exacto de: `MapaSismos.tsx` ("Mi ubicación", "Ver todo Chile", "Compartir" — este último aria-label duplica el de `compartir.boton`, usa la clave de `compartir` acá igual, no la repitas en `mapa`, "Sin conexión, reintentando…"), `BotonFiltroMapa.tsx` ("Filtro", aria-labels "Filtrar mapa"/"Filtrar mapa (filtro activo)"), `BotonFallasMapa.tsx` ("Fallas", aria-labels "Mostrar fallas geológicas"/"Ocultar fallas geológicas"), `ModalFiltroMapa.tsx` ("Filtrar mapa", "Solo Chile", "Magnitud", "Ocurridos en", y las opciones del select de ventana de tiempo), `SelectorMagnitudRangos.tsx` ("Leve (M2–4)", "Moderado (M4–6)", "Fuerte (M6+)", el `title` de bloqueo "Debe quedar al menos un rango de magnitud activo").

- [ ] **Step 2: Agregar los namespaces a `apps/web/messages/es.json`**

```json
{
  "mapa": {
    "miUbicacion": "Mi ubicación",
    "verTodoChile": "Ver todo Chile",
    "sinConexion": "Sin conexión, reintentando…"
  },
  "filtro": {
    "titulo": "Filtrar mapa",
    "abrir": "Filtrar mapa",
    "abrirActivo": "Filtrar mapa (filtro activo)",
    "soloChile": "Solo Chile",
    "magnitud": "Magnitud",
    "ocurridosEn": "Ocurridos en",
    "leve": "Leve (M2–4)",
    "moderado": "Moderado (M4–6)",
    "fuerte": "Fuerte (M6+)",
    "rangoBloqueado": "Debe quedar al menos un rango de magnitud activo",
    "mostrarFallas": "Mostrar fallas geológicas",
    "ocultarFallas": "Ocultar fallas geológicas",
    "fallas": "Fallas"
  }
}
```

Ajusta/completa con las opciones exactas del select de ventana de tiempo (`ModalFiltroMapa.tsx`) que confirmaste en el Step 1 — agrégalas bajo `filtro.ventana.*` (una clave por opción, ej. `filtro.ventana.10d`: "Últimos 10 días").

- [ ] **Step 3: Migrar los cinco componentes**

Mismo patrón que la Tarea 2: `const t = useTranslations("mapa")` o `useTranslations("filtro")` según el archivo, reemplazando cada string estático (incluidos `aria-label`) por `t("clave")`. `SelectorMagnitudRangos.tsx` usa el namespace `filtro` (sus labels ya están ahí). El `title` de bloqueo del chip usa `filtro.rangoBloqueado`.

- [ ] **Step 4: Verificar**

```bash
cd apps/web && npx tsc --noEmit && npx eslint --max-warnings 0
```

En el navegador: mapa principal (botones "Filtro"/"Fallas"/"Ver todo Chile"/"Mi ubicación"), abre el modal de filtro, confirma "Solo Chile"/chips de magnitud/select de ventana, y prueba dejar un solo chip activo para ver el bloqueo con su texto.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/mapa/MapaSismos.tsx apps/web/components/mapa/BotonFiltroMapa.tsx apps/web/components/mapa/BotonFallasMapa.tsx apps/web/components/mapa/ModalFiltroMapa.tsx apps/web/components/filtro/SelectorMagnitudRangos.tsx apps/web/messages/es.json
git commit -m "feat(web): migra controles del mapa y filtro a next-intl"
```

---

### Task 4: Namespace `historial`

**Files:**
- Modify: `apps/web/components/historial/ListaHistorial.tsx`, `PanelHistorial.tsx`, `PantallaHistorial.tsx`
- Modify: `apps/web/messages/es.json`

**Interfaces:**
- Consumes: `comun`.
- Produces: namespace `historial`.

- [ ] **Step 1: Leer los tres archivos completos**

Confirma: título "Historial de sismos" (se repite en `PanelHistorial.tsx` y `PantallaHistorial.tsx` — misma clave `historial.titulo` en ambos), las opciones del select de tipo (`OPCIONES_TIPO` en `lib/use-historial.ts` — lee también ese archivo, aunque no lo migres directamente, para saber los valores/etiquetas exactos), "🇨🇱 Solo Chile", "Cargando sismos…", "No se pudo cargar el historial de sismos.", "Reintentar", "Sin sismos para estos filtros", el botón "Quitar filtros" agregado en una tarea anterior, la plantilla `"M{mag} — {fecha}"` (usa formato ICU con placeholder), `"{n} km de profundidad"`.

- [ ] **Step 2: Agregar el namespace `historial` a `es.json`**

```json
{
  "historial": {
    "titulo": "Historial de sismos",
    "soloChile": "🇨🇱 Solo Chile",
    "cargando": "Cargando sismos…",
    "errorCarga": "No se pudo cargar el historial de sismos.",
    "reintentar": "Reintentar",
    "sinResultados": "Sin sismos para estos filtros",
    "quitarFiltros": "Quitar filtros",
    "profundidad": "{n} km de profundidad",
    "magnitudFecha": "M{magnitud} — {fecha}"
  }
}
```

Agrega bajo `historial.tipo.*` una clave por cada opción de `OPCIONES_TIPO` que confirmaste en el Step 1 (ej. `historial.tipo.recientes`, ajusta los nombres según los `valor` reales del archivo).

- [ ] **Step 3: Migrar los tres componentes**

Mismo patrón. Para `magnitudFecha` y `profundidad`, que llevan valores, usa `t("magnitudFecha", { magnitud: evento.magnitud, fecha: new Date(evento.fecha).toLocaleString("es-CL") })` — **ojo:** `toLocaleString("es-CL")` queda hardcodeado a español; en la Tarea 12, cuando se agregue soporte real de inglés, este call debe leer el locale actual en vez de `"es-CL"` fijo (dejar una nota `// TODO Tarea 12: usar el locale actual` en el código en este punto, ya que resolverlo ahora sin el resto de la infra de detección de idioma sería prematuro).

- [ ] **Step 4: Verificar**

```bash
cd apps/web && npx tsc --noEmit && npx eslint --max-warnings 0
```

En el navegador: abre "Sismos" desde el menú (pantalla fullscreen de historial) y, en una ventana ancha, el panel de escritorio — confirma título, filtros, y el estado vacío/error con sus textos y botones.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/historial/ apps/web/messages/es.json
git commit -m "feat(web): migra historial de sismos a next-intl"
```

---

### Task 5: Namespace `configuracion`

**Files:**
- Modify: `apps/web/components/configuracion/ModalConfiguracion.tsx`
- Modify: `apps/web/messages/es.json`

**Interfaces:**
- Consumes: `comun`.
- Produces: namespace `configuracion`.

- [ ] **Step 1: Leer el archivo completo**

Confirma: "Notificaciones", "Activar con esta configuración"/"Desactivar notificaciones", "Avisar desde M4+" (el label del slider, con el valor dinámico), "Alcance", "Sin límite de distancia (dentro de Chile)", "Avisarme también de terremotos M7+ en cualquier país, sin importar la distancia", "Guardar"/"Guardado ✓", los mensajes de error ("No pudimos activar las notificaciones. Prueba de nuevo.", "No pudimos guardar los cambios. Prueba de nuevo."), el mensaje de `permission === "unsupported"` y el de `permission === "denied"`.

- [ ] **Step 2: Agregar el namespace `configuracion` a `es.json`**

```json
{
  "configuracion": {
    "titulo": "Notificaciones",
    "activar": "Activar con esta configuración",
    "desactivar": "Desactivar notificaciones",
    "avisarDesde": "Avisar desde M{umbral}+",
    "alcance": "Alcance",
    "sinLimiteDistancia": "Sin límite de distancia (dentro de Chile)",
    "avisarM7Global": "Avisarme también de terremotos M7+ en cualquier país, sin importar la distancia",
    "guardado": "Guardado ✓",
    "errorActivar": "No pudimos activar las notificaciones. Prueba de nuevo.",
    "errorGuardar": "No pudimos guardar los cambios. Prueba de nuevo.",
    "noSoportado": "Tu navegador o dispositivo no soporta notificaciones push. En iPhone, primero agrega esta app a la pantalla de inicio.",
    "bloqueado": "Bloqueaste las notificaciones para este sitio. Para activarlas, cambia el permiso desde la configuración de notificaciones de tu navegador."
  }
}
```

(`comun.guardar` ya cubre el botón "Guardar" en su estado normal — solo `configuracion.guardado` es nuevo, para el estado "Guardado ✓".)

- [ ] **Step 3: Migrar el componente**

Mismo patrón. `t("avisarDesde", { umbral: valorSlider })` para el label con valor dinámico.

- [ ] **Step 4: Verificar**

```bash
cd apps/web && npx tsc --noEmit && npx eslint --max-warnings 0
```

En el navegador: abre "Notificaciones" desde el menú, confirma todos los textos y ambos mensajes de error forzando los estados si es posible (o al menos confirma visualmente que no quedó ninguna clave sin resolver).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/configuracion/ModalConfiguracion.tsx apps/web/messages/es.json
git commit -m "feat(web): migra modal de notificaciones a next-intl"
```

---

### Task 6: Namespace `instalar`

**Files:**
- Modify: `apps/web/components/instalar/ModalInstalarApp.tsx`
- Modify: `apps/web/messages/es.json`

**Interfaces:**
- Consumes: `comun`.
- Produces: namespace `instalar`.

- [ ] **Step 1: Leer el archivo completo**

Confirma: "Instala la app", el tooltip "¿Qué es una PWA?" + su texto explicativo, "¿Qué estás usando? Te mostramos los pasos para tu dispositivo.", "Android", "iPhone", el texto de instrucciones iOS, el texto de instrucciones Android nativo, el texto de instrucciones Android manual (sin `deferredPrompt`), "Instalar".

- [ ] **Step 2: Agregar el namespace `instalar` a `es.json`**

```json
{
  "instalar": {
    "titulo": "Instala la app",
    "queEsPwaLabel": "¿Qué es una PWA?",
    "queEsPwaTexto": "Una PWA es una app web que se instala como una app normal: ícono propio, pantalla completa y notificaciones.",
    "queUsas": "¿Qué estás usando? Te mostramos los pasos para tu dispositivo.",
    "android": "Android",
    "iphone": "iPhone",
    "iosInstrucciones": "Toca el ícono Compartir (⬆️) en la barra del navegador y elige \"Agregar a inicio\". En iPhone las notificaciones de sismos solo funcionan así — y en general se siente como una app real, a pantalla completa.",
    "androidNativoInstrucciones": "Agrega Sismos a tu pantalla de inicio: se abre a pantalla completa, con su propio ícono, y se siente como una app real.",
    "androidManualInstrucciones": "Abre el menú ⋮ del navegador y elige \"Instalar app\" o \"Agregar a pantalla de inicio\".",
    "instalar": "Instalar"
  }
}
```

- [ ] **Step 3: Migrar el componente**

Mismo patrón, usando también `comun.cerrar`/`comun.volver`/`comun.entendido`/`comun.ahoraNo` donde correspondan (este componente ya los usa como texto genérico).

- [ ] **Step 4: Verificar**

```bash
cd apps/web && npx tsc --noEmit && npx eslint --max-warnings 0
```

En el navegador: abre "Instalar app" desde el menú (si hace falta, dispara `beforeinstallprompt` manualmente vía consola como se hizo antes en esta sesión), prueba el picker, el tooltip, ambas plataformas y el caso sin `deferredPrompt`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/instalar/ModalInstalarApp.tsx apps/web/messages/es.json
git commit -m "feat(web): migra modal de instalar app a next-intl"
```

---

### Task 7: Namespace `fallas`

**Files:**
- Modify: `apps/web/components/fallas/PantallaFallas.tsx`
- Modify: `apps/web/messages/es.json`

**Interfaces:**
- Consumes: `comun`.
- Produces: namespace `fallas`.

- [ ] **Step 1: Leer el archivo completo**

Confirma (ya visto parcialmente en esta sesión): título "Fallas geológicas", "No se pudo cargar la lista de fallas.", y cualquier otro texto de estado vacío/carga/lista de fallas que exista en el archivo (revisa la lista completa, no solo el header).

- [ ] **Step 2: Agregar el namespace `fallas` a `es.json`**

```json
{
  "fallas": {
    "titulo": "Fallas geológicas",
    "errorCarga": "No se pudo cargar la lista de fallas."
  }
}
```

Agrega cualquier clave adicional que hayas encontrado en el Step 1 (estado de carga, estado vacío, texto de cada ítem de la lista si tiene copy fijo más allá de datos).

- [ ] **Step 3: Migrar el componente**

Mismo patrón, `useTranslations("fallas")` + `comun` para "Volver".

- [ ] **Step 4: Verificar**

```bash
cd apps/web && npx tsc --noEmit && npx eslint --max-warnings 0
```

En el navegador: abre "Fallas" desde el menú, confirma título y estados.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/fallas/PantallaFallas.tsx apps/web/messages/es.json
git commit -m "feat(web): migra pantalla de fallas geológicas a next-intl"
```

---

### Task 8: Namespaces `splash` + `compartir`

**Files:**
- Modify: `apps/web/components/SplashPWA.tsx`
- Modify: `apps/web/lib/use-compartir.tsx`
- Modify: `apps/web/components/menu/MenuLateral.tsx` (línea del botón "Compartir"/"Enlace copiado", pendiente desde la Tarea 2)
- Modify: `apps/web/components/mapa/MapaSismos.tsx` (aria-label del botón flotante de compartir, pendiente desde la Tarea 3)
- Modify: `apps/web/messages/es.json`

**Interfaces:**
- Consumes: `comun`.
- Produces: namespaces `splash` y `compartir`.

- [ ] **Step 1: Leer los archivos**

`SplashPWA.tsx`: el texto "Sismos" en `<p className="splash-titulo ...">` — este es el nombre de marca, **no se traduce** (ver Global Constraints), así que en vez de moverlo a `splash.titulo` con distintas versiones por idioma, déjalo como literal `"Sismos"` en el JSX (no lo migres) — a menos que el archivo tenga OTRO texto además del nombre (revísalo completo, ej. algún subtítulo o mensaje de carga) que sí sea candidato a `splash.*`.

`use-compartir.tsx`: la constante `MENSAJE_COMPARTIR`, el `title: "Sismos"` que se le pasa a `navigator.share` (también nombre de marca, no se traduce), el texto "Enlace copiado" y el mensaje de error agregado en una sesión anterior ("No se pudo compartir" o similar — confirma el texto exacto).

- [ ] **Step 2: Agregar los namespaces a `es.json`**

```json
{
  "compartir": {
    "boton": "Compartir",
    "mensaje": "Mira los sismos de Chile y el mundo en tiempo real",
    "enlaceCopiado": "Enlace copiado",
    "errorCompartir": "No se pudo compartir"
  }
}
```

Ajusta `compartir.mensaje` y `compartir.errorCompartir` al texto exacto que encontraste en el Step 1. Si `SplashPWA.tsx` no tiene ningún texto traducible además del nombre de marca, el namespace `splash` queda vacío/no se crea en esta tarea — anótalo en el mensaje del commit.

- [ ] **Step 3: Migrar `use-compartir.tsx`**

Este es un hook, no un componente — `useTranslations` funciona igual dentro de un hook `"use client"` que se llama desde un componente cliente:

```ts
"use client";
import { useTranslations } from "next-intl";

export function useCompartir() {
  const t = useTranslations("compartir");
  // ...usa t("mensaje"), t("enlaceCopiado"), t("errorCompartir") donde
  // antes había los strings hardcodeados. El `title: "Sismos"` del
  // objeto que se le pasa a navigator.share queda igual (nombre de marca).
}
```

- [ ] **Step 4: Terminar de migrar el botón "Compartir" en `MenuLateral.tsx` y `MapaSismos.tsx`**

Estos dos archivos ya se migraron en las Tareas 2 y 3 para sus propios namespaces (`menu`, `mapa`/`filtro`) — ahora que existe el namespace `compartir`, reemplaza ahí el texto/aria-label de "Compartir" hardcodeado (si quedó pendiente) por `useTranslations("compartir")`.

- [ ] **Step 5: Verificar**

```bash
cd apps/web && npx tsc --noEmit && npx eslint --max-warnings 0
```

En el navegador: prueba compartir desde el menú y desde el botón flotante del mapa (en un navegador sin `navigator.share`, confirma el toast "Enlace copiado"; si puedes forzar el error, confirma el toast de error).

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/SplashPWA.tsx apps/web/lib/use-compartir.tsx apps/web/components/menu/MenuLateral.tsx apps/web/components/mapa/MapaSismos.tsx apps/web/messages/es.json
git commit -m "feat(web): migra compartir y revisa splash para next-intl"
```

---

### Task 9: Namespace `login`

**Files:**
- Modify: `apps/web/app/login/page.tsx`
- Modify: `apps/web/messages/es.json`

**Interfaces:**
- Consumes: `comun`.
- Produces: namespace `login`.

- [ ] **Step 1: Leer el archivo completo**

Confirma todos los strings: labels de email/contraseña/nombre, botón de submit (login/registro), "No se pudo iniciar sesión con Google. Intenta de nuevo.", "Email o contraseña incorrectos", "Ocurrió un error, intenta de nuevo", el toggle "¿Ya tienes cuenta? Iniciar sesión" / "¿No tienes cuenta? Regístrate", y cualquier botón de "Continuar con Google" o similar.

- [ ] **Step 2: Agregar el namespace `login` a `es.json`**

```json
{
  "login": {
    "iniciarSesion": "Iniciar sesión",
    "registrarse": "Regístrate",
    "email": "Email",
    "contrasena": "Contraseña",
    "nombre": "Nombre",
    "continuarGoogle": "Continuar con Google",
    "errorGoogle": "No se pudo iniciar sesión con Google. Intenta de nuevo.",
    "credencialesIncorrectas": "Email o contraseña incorrectos",
    "errorGenerico": "Ocurrió un error, intenta de nuevo",
    "yaTienesCuenta": "¿Ya tienes cuenta? Iniciar sesión",
    "noTienesCuenta": "¿No tienes cuenta? Regístrate"
  }
}
```

Ajusta las claves a los labels/placeholders reales que confirmaste en el Step 1 (los nombres exactos de los campos del formulario pueden diferir levemente).

- [ ] **Step 3: Migrar el componente**

Mismo patrón, `useTranslations("login")`. Este es un Client Component (`"use client"` — confirma en el Step 1), así que usa `useTranslations`, no `getTranslations`.

- [ ] **Step 4: Verificar**

```bash
cd apps/web && npx tsc --noEmit && npx eslint --max-warnings 0
```

En el navegador: `/login`, confirma formulario completo, toggle registro/login, y los mensajes de error (forzando credenciales incorrectas).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/login/page.tsx apps/web/messages/es.json
git commit -m "feat(web): migra login a next-intl"
```

---

### Task 10: Namespace `admin`

**Files:**
- Modify: `apps/web/app/admin/layout.tsx`, `apps/web/app/admin/usuarios/page.tsx`, `apps/web/app/admin/reportes/page.tsx`
- Modify: `apps/web/messages/es.json`

**Interfaces:**
- Consumes: `comun`.
- Produces: namespace `admin`.

- [ ] **Step 1: Leer los tres archivos completos**

Confirma: cualquier texto en `admin/layout.tsx` (título de sección, guard de acceso), "Usuarios registrados", "Sin usuarios registrados", los headers de tabla "Email"/"Nombre"/"Rol"/"Registrado", "Reportes", "Próximamente".

- [ ] **Step 2: Agregar el namespace `admin` a `es.json`**

```json
{
  "admin": {
    "usuariosRegistrados": "Usuarios registrados",
    "sinUsuarios": "Sin usuarios registrados",
    "colEmail": "Email",
    "colNombre": "Nombre",
    "colRol": "Rol",
    "colRegistrado": "Registrado",
    "reportes": "Reportes",
    "proximamente": "Próximamente"
  }
}
```

Agrega lo que encuentres en `admin/layout.tsx` en el Step 1 (si tiene copy propio).

- [ ] **Step 3: Migrar los tres archivos — son Server Components**

Estos son Server Components (no tienen `"use client"` — confírmalo en el Step 1; si alguno lo tiene, usa el patrón de la Tarea 9 en su lugar para ese archivo). Usa `getTranslations` en vez de `useTranslations`:

```tsx
import { getTranslations } from "next-intl/server";

export default async function UsuariosPage() {
  const t = await getTranslations("admin");
  const usuarios = await obtenerUsuarios(); // lo que ya haga el archivo
  return (
    // ... reemplaza "Usuarios registrados" por {t("usuariosRegistrados")}, etc.
  );
}
```

- [ ] **Step 4: Verificar**

```bash
cd apps/web && npx tsc --noEmit && npx eslint --max-warnings 0
```

`npx next build --webpack` fallará en `/admin/usuarios` por la falta de conexión a la base de datos local en este entorno (problema preexistente, no relacionado) — confirma que el error sea exactamente ese (`ECONNREFUSED` a Postgres) y no un error nuevo de tipos o de `next-intl`.

Si tienes forma de loguearte como admin en el dev server, confirma visualmente ambas páginas.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/admin/ apps/web/messages/es.json
git commit -m "feat(web): migra páginas de admin a next-intl"
```

---

### Task 11: Namespace `auth`

**Files:**
- Modify: `apps/web/components/auth/AuthToastWatcher.tsx`
- Modify: `apps/web/messages/es.json`

**Interfaces:**
- Consumes: `comun`.
- Produces: namespace `auth`.

- [ ] **Step 1: Agregar el namespace `auth` a `es.json`**

```json
{
  "auth": {
    "sesionIniciada": "Sesión iniciada",
    "sesionCerrada": "Sesión cerrada",
    "vuelvePronto": "Vuelve pronto 👋"
  }
}
```

- [ ] **Step 2: Migrar el componente**

`AuthToastWatcher.tsx` es `"use client"`. Los toasts se construyen con JSX pasado a `toast.custom(...)` (de `sonner`) — el hook `useTranslations` se llama en el cuerpo del componente ANTES de armar el JSX del toast, igual que cualquier otro string:

```tsx
"use client";
import { useTranslations } from "next-intl";
// ...
export default function AuthToastWatcher() {
  const t = useTranslations("auth");
  // ...
  // dentro del toast.custom para login:
  <p className="text-sm font-medium text-neutral-100">{t("sesionIniciada")}</p>
  // dentro del toast.custom para logout:
  <p className="text-sm font-medium text-neutral-100">{t("sesionCerrada")}</p>
  <p className="text-xs text-neutral-400">{t("vuelvePronto")}</p>
}
```

- [ ] **Step 3: Verificar**

```bash
cd apps/web && npx tsc --noEmit && npx eslint --max-warnings 0
```

En el navegador: inicia y cierra sesión, confirma que ambos toasts se ven idénticos a antes.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/auth/AuthToastWatcher.tsx apps/web/messages/es.json
git commit -m "feat(web): migra toasts de sesión a next-intl"
```

---

### Task 12: Inglés completo + detección de idioma + selector

**Files:**
- Create: `apps/web/messages/en.json`
- Create: `apps/web/lib/actions/cambiar-idioma.ts`
- Modify: `apps/web/i18n/request.ts`
- Modify: `apps/web/components/menu/MenuLateral.tsx`
- Modify: `apps/web/messages/es.json` (agregar `menu.idioma`)

**Interfaces:**
- Consumes: `es.json` completo (namespaces `comun`, `menu`, `mapa`, `filtro`, `historial`, `configuracion`, `instalar`, `fallas`, `compartir`, `login`, `admin`, `auth` — todos poblados por las Tareas 1-11).
- Produces: `en.json` con la misma forma exacta que `es.json` (mismos namespaces, mismas claves — solo cambia el idioma de los valores); la app soporta español e inglés de punta a punta.

- [ ] **Step 1: Verificar que `es.json` está completo**

```bash
cd apps/web && grep -rn 'useTranslations\|getTranslations' components app lib | wc -l
```

Confirma que el número de archivos que importan `useTranslations`/`getTranslations` coincide con los ~13 archivos migrados en las Tareas 2-11 (más `layout.tsx` de la Tarea 1). Si falta alguno de los ~25 archivos con copy identificados al inicio de este proyecto, migralo ahora antes de seguir (namespace `comun` u otro que corresponda).

- [ ] **Step 2: Crear `apps/web/messages/en.json`**

Copia la estructura completa de `es.json` y traduce cada valor al inglés, namespace por namespace, manteniendo **exactamente las mismas claves** (`tsc`/`next-intl` no van a fallar si difieren, pero la app se rompe en runtime para las claves que falten en un idioma). Ejemplo de las primeras entradas (traduce el resto siguiendo el mismo criterio: inglés neutro, sin jerga regional):

```json
{
  "comun": {
    "cerrar": "Close",
    "volver": "Back",
    "entendido": "Got it",
    "ahoraNo": "Not now",
    "guardar": "Save"
  },
  "menu": {
    "titulo": "Menu",
    "abrirMenu": "Open menu",
    "cerrarMenu": "Close menu",
    "sismos": "Earthquakes",
    "fallas": "Faults",
    "notificaciones": "Notifications",
    "admin": "Admin",
    "usuarios": "Users",
    "reportes": "Reports",
    "instalarApp": "Install app",
    "idioma": "Language"
  }
}
```

Sigue el mismo criterio para el resto de los namespaces (`mapa`, `filtro`, `historial`, `configuracion`, `instalar`, `fallas`, `compartir`, `login`, `admin`, `auth`) usando el contenido real de `es.json` como fuente. El nombre de marca "Sismos" (splash, `navigator.share` title) NO se traduce, queda igual en `en.json` donde aparezca literal en el código (no está en el diccionario, según la Tarea 8).

- [ ] **Step 3: Agregar `menu.idioma` a ambos diccionarios**

`es.json`: `"idioma": "Idioma"` dentro de `menu`. `en.json`: ya agregado en el Step 2 (`"idioma": "Language"`).

- [ ] **Step 4: Actualizar `apps/web/i18n/request.ts` con detección real**

```ts
import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

const LOCALES = ["es", "en"] as const;
export type Locale = (typeof LOCALES)[number];
const LOCALE_DEFAULT: Locale = "es";
export const CLAVE_COOKIE_IDIOMA = "NEXT_LOCALE";

function detectarLocaleInicial(aceptLanguage: string | null): Locale {
  if (!aceptLanguage) return LOCALE_DEFAULT;
  return aceptLanguage.toLowerCase().startsWith("en") ? "en" : LOCALE_DEFAULT;
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
```

- [ ] **Step 5: Crear la Server Action `apps/web/lib/actions/cambiar-idioma.ts`**

```ts
"use server";

import { cookies } from "next/headers";
import { CLAVE_COOKIE_IDIOMA, type Locale } from "../../i18n/request";

export async function cambiarIdioma(locale: Locale) {
  (await cookies()).set(CLAVE_COOKIE_IDIOMA, locale, {
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
}
```

- [ ] **Step 6: Agregar el selector a `MenuLateral.tsx`**

Nuevo ítem debajo de "Instalar app" (o donde encaje mejor visualmente — sigue el mismo patrón visual que los otros ítems del menú: ícono + label, `min-h-11`, `touch-manipulation`, `active:scale-[0.97]`). Las etiquetas "Español"/"English" son literales, no van al diccionario (ver Global Constraints):

```tsx
"use client";
import { useLocale } from "next-intl";
import { useTransition } from "react";
import { cambiarIdioma } from "../../lib/actions/cambiar-idioma";
// ...dentro del componente:
const locale = useLocale();
const [, startTransition] = useTransition();
const t = useTranslations("menu");
// ...
<button
  type="button"
  onClick={() =>
    elegir(() =>
      startTransition(() => {
        cambiarIdioma(locale === "es" ? "en" : "es");
        router.refresh();
      }),
    )
  }
  className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-neutral-200 touch-manipulation transition duration-150 hover:bg-neutral-800 active:scale-[0.97] active:bg-neutral-800 active:brightness-95"
>
  {/* ícono simple, ej. un globo — sigue el estilo de los otros íconos del archivo */}
  {t("idioma")}: {locale === "es" ? "Español" : "English"}
</button>
```

(`router` ya debería existir en este componente — confirma el import de `useRouter` de `next/navigation`; si no existe, agrégalo.)

- [ ] **Step 7: Verificar todo el flujo bilingüe**

```bash
cd apps/web && npx tsc --noEmit && npx eslint --max-warnings 0
```

En el navegador: cambia a inglés desde el menú, recorre **todas** las pantallas migradas (mapa, menú, filtro, historial, configuración, instalar, fallas, login, compartir) confirmando que todo está en inglés y no hay ninguna clave sin resolver ni mezcla de idiomas. Cambia de vuelta a español y confirma lo mismo. Prueba también que, en una pestaña nueva sin cookie todavía, con el navegador configurado en inglés (`Accept-Language: en`), la primera carga ya viene en inglés.

- [ ] **Step 8: Commit**

```bash
git add apps/web/messages/en.json apps/web/messages/es.json apps/web/i18n/request.ts apps/web/lib/actions/cambiar-idioma.ts apps/web/components/menu/MenuLateral.tsx
git commit -m "feat(web): agrega inglés completo, detección de idioma y selector en el menú"
```

---

## Self-Review

**Cobertura del spec:** las 5 secciones de alcance del spec están cubiertas — extracción completa (Tareas 1-11), inglés + admin funcionando (Tarea 10 + 12), selector en el menú (Tarea 12), cookie (Tarea 12 / Task 1 la deja lista), detección `Accept-Language` (Tarea 12). El único ajuste respecto al spec es la decisión explícita en "Global Constraints" de posponer la detección real de idioma hasta la Tarea 12 en vez de tenerla desde la Tarea 1 — se documenta el porqué (deploys intermedios seguros) en vez de dejarlo implícito.

**Placeholders:** ninguna tarea deja "TBD"/"implementar después" — donde el texto exacto de un archivo no se transcribió literal en este plan (para no arrastrar errores de transcripción), se instruye explícitamente "lee el archivo y usa el texto exacto", con la clave de destino ya definida — no es una decisión abierta, es una instrucción mecánica.

**Consistencia de tipos/nombres:** los namespaces (`comun`, `menu`, `mapa`, `filtro`, `historial`, `configuracion`, `instalar`, `fallas`, `splash`, `compartir`, `login`, `admin`, `auth`) se usan consistentemente entre el spec, la sección de File Structure y cada tarea. `CLAVE_COOKIE_IDIOMA` y `Locale` se exportan desde `i18n/request.ts` en la Tarea 12 y se importan igual en la Server Action de la misma tarea — no hay otra tarea que dependa de esos nombres antes de que existan.
