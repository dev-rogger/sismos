# Notificaciones push para terremotos mundiales (USGS) — design

## Contexto

Las push notifications ya están implementadas (`docs/superpowers/specs/2026-07-15-push-notifications-design.md`, `docs/superpowers/specs/2026-07-27-radio-notificaciones-design.md`) pero deliberadamente acotadas a sismos CSN (Chile): el loop de USGS en `apps/ingestor/lib/ingest.ts` (líneas 79-92) nunca llama a `enviarPushParaSismo`. Motivo original: "es una app gratuita", evitar el volumen de sismos menores a nivel mundial.

Disparador: un terremoto en Colombia no generó ninguna notificación pese a ser relevante para un usuario en Chile — "soy de Chile y hubo un terremoto en un país vecino, igual es importante". El pedido no es recibir cualquier sismo mundial (decenas de M4+ por día), sino terremotos grandes en cualquier país.

## Alcance

1. Nuevo toggle opt-in **"Alcance mundial"** en la suscripción push, default `false` — nadie ve un salto de volumen sin activarlo explícitamente.
2. Umbral fijo, no configurable por el usuario: **M7.0+** para eventos no-Chile. No hay slider para esto (a diferencia del umbral 4-7 de Chile).
3. Cuando el alcance mundial está activo, el umbral M7.0+ aplica **sin límite de distancia** — ignora `radioKm`/`centro` por completo. Un M7+ en cualquier país notifica, sin importar qué tan lejos esté.
4. El filtro de Chile (`magnitudMinima` 4-7 + radio opcional) no cambia en absoluto — es independiente y ortogonal al alcance mundial.

Fuera de alcance: umbral mundial configurable por el usuario; aplicar el radio geográfico a eventos mundiales; cualquier cambio al pipeline de Chile/CSN existente.

## Modelo de datos

**`packages/db/src/schema.ts`** — nueva columna en `pushSubscriptions`:

```ts
alcanceMundial: boolean("alcance_mundial").notNull().default(false),
```

Migración vía `drizzle-kit generate` — columna con default `false`, no requiere backfill ni rompe filas existentes (mismo patrón que `centroLat`/`centroLon`/`radioKm` en el spec de radio).

**`packages/shared`** — nueva constante junto a `regionChilePorLatitud`/`distanciaKm`:

```ts
export const UMBRAL_MAGNITUD_MUNDIAL = 7;
```

Reutilizada tanto por el filtro de suscripciones (`packages/db`) como por el ingestor, para no duplicar el número mágico.

## Filtro backend (`packages/db/src/queries/push-subscription.ts`)

`findSubscripcionesParaSismo` pasa a recibir también `fuente`:

```ts
export async function findSubscripcionesParaSismo(
  evento: { magnitud: number; latitud: number; longitud: number; fuente: SismoFuente },
): Promise<PushSubscription[]> {
  if (evento.fuente !== "csn") {
    if (evento.magnitud < UMBRAL_MAGNITUD_MUNDIAL) return [];
    const candidatas = await getDb()
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.alcanceMundial, true));
    return candidatas.map(toPushSubscription); // sin filtro de distancia
  }

  // comportamiento actual, sin cambios: magnitudMinima + radio/centro opcional
  const candidatas = await getDb()
    .select()
    .from(pushSubscriptions)
    .where(lte(pushSubscriptions.magnitudMinima, evento.magnitud));

  return candidatas
    .map(toPushSubscription)
    .filter((sub) => {
      if (sub.radioKm === null) return true;
      if (sub.centroLat === null || sub.centroLon === null) return true;
      return distanciaKm(sub.centroLat, sub.centroLon, evento.latitud, evento.longitud) <= sub.radioKm;
    });
}
```

`upsertPushSubscription` acepta el nuevo campo `alcanceMundial: boolean` junto a los existentes.

## Ingestor (`apps/ingestor/lib/ingest.ts`)

El loop de USGS (líneas 79-92) hoy no captura si el `upsertSismo` insertó un evento nuevo. Se alinea con el patrón que ya usa el loop de CSN:

```ts
for (const evento of usgsEventos) {
  const csnCandidatos = await findRecentByFuente("csn", since);
  const match = findDuplicate(evento, csnCandidatos as SismoNormalizado[]);
  if (match) {
    await setRefCruzada(match.fuente, match.externalId, {
      fuente: evento.fuente,
      externalId: evento.externalId,
    });
    summary.deduped += 1;
  } else {
    const { esNuevo } = await upsertSismo(evento);
    summary.usgs.inserted += 1;
    if (esNuevo && evento.magnitud >= UMBRAL_MAGNITUD_MUNDIAL) {
      try {
        await enviarPushParaSismo(evento);
      } catch (error) {
        console.error("[ingest] push notification failed:", error);
      }
    }
  }
}
```

El chequeo `evento.magnitud >= UMBRAL_MAGNITUD_MUNDIAL` antes de llamar a `enviarPushParaSismo` es una optimización (evita una consulta a la DB para la mayoría del feed USGS, que es de magnitud baja), no reemplaza el filtro real que ya vive en `findSubscripcionesParaSismo`.

## `apps/ingestor/lib/send-push.ts`

`enviarPushParaSismo` pasa `evento.fuente` a `findSubscripcionesParaSismo`. El resto no cambia: el título ya usa `regionChilePorLatitud(evento.latitud)` con fallback a `evento.lugar` cuando es `null` (fuera de Chile), así que un evento de Colombia ya se ve bien — *"Nuevo terremoto de 7.2 en [lugar]"* — sin cambios adicionales de texto.

## API (`apps/web/app/api/push/subscribe/route.ts`)

`POST` acepta el campo adicional `alcanceMundial: boolean` (default `false` si no viene) y lo pasa a `upsertPushSubscription`. `DELETE` no cambia.

## Frontend

**`apps/web/lib/use-push-notifications.ts`**: `activar`/`actualizarUmbral` reciben un parámetro adicional `alcanceMundial: boolean`, incluido en el body de `POST /api/push/subscribe`. Nuevo estado `alcanceMundial` en el hook, análogo a `magnitudMinima`/`radioKm`.

**`apps/web/components/configuracion/ModalConfiguracion.tsx`**: nueva sección **separada** de la de "Alcance" (radio de Chile), con su propio encabezado para no confundirse con el toggle existente "🌎 Mundial, sin rango" (que es sobre el radio de Chile, no sobre recibir eventos mundiales):

```tsx
<div className="mt-4 border-t border-neutral-800 pt-4">
  <div className="mb-2 flex items-center justify-between">
    <span className="text-xs text-neutral-400">Terremotos en el mundo</span>
    <button
      type="button"
      onClick={() => setAlcanceMundialLocal((v) => !v)}
      aria-pressed={alcanceMundialLocal}
      className={/* mismo estilo que los otros toggles */}
    >
      Avisarme
    </button>
  </div>
  <p className="text-xs text-neutral-400">
    Terremotos grandes (M7.0+) en cualquier país, sin importar la distancia.
  </p>
</div>
```

Sin slider (umbral fijo). El botón "Guardar" existente incluye `alcanceMundial` en el payload enviado a `activar`/`actualizarUmbral`.

## Testing / verificación

- Migración aplicada contra Postgres local; confirmar que filas existentes quedan con `alcance_mundial = false` (sin cambio de comportamiento).
- Suscripción con `alcanceMundial = false` + evento USGS de M8 → no dispara notificación.
- Suscripción con `alcanceMundial = true` + evento USGS de M6.5 → no dispara (bajo el umbral M7.0).
- Suscripción con `alcanceMundial = true` + evento USGS de M7.2 en cualquier lugar del mundo (incluyendo lejos del `centro`/`radioKm` configurado para Chile) → dispara notificación, con el `lugar` correcto en el título.
- Un evento CSN (Chile) sigue respetando `magnitudMinima`/`radioKm` exactamente igual que antes, sin relación con `alcanceMundial`.
- Reiniciar el ingestor y volver a correr sobre el mismo evento USGS ya insertado → no reenvía la notificación (gracias al chequeo de `esNuevo`).
