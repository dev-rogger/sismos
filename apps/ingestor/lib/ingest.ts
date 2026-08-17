import {
  findDuplicate,
  normalizeCsnSismo,
  normalizeUsgsFeature,
  normalizeGaelSismo,
  UMBRAL_MAGNITUD_MUNDIAL,
  type SismoNormalizado,
} from "@sismos/shared";
import {
  findRecentByFuente,
  findRecentAproximados,
  findUltimoCsnPreciso,
  replaceWithCsn,
  reemplazarConPrecision,
  actualizarAproximadoExistente,
  setRefCruzada,
  upsertSismo,
  getUltimaAlertaEnviada,
  marcarAlertaEnviada,
} from "@sismos/db";
import { fetchCsnRecent } from "./fetch-csn";
import { fetchGaelRecent } from "./fetch-gael";
import { fetchUsgsRecent } from "./fetch-usgs";
import { enviarPushParaSismo, enviarAlertaAdmin } from "./send-push";

interface SourceResult {
  fetched: number;
  inserted: number;
  errors: number;
}

export interface IngestSummary {
  csn: SourceResult;
  usgs: SourceResult;
  deduped: number;
}

const DEDUPE_WINDOW_MS = 10 * 60 * 1000;
const RECONCILIACION_LOOKBACK_MS = 24 * 60 * 60 * 1000;

export async function runIngest(): Promise<IngestSummary> {
  const summary: IngestSummary = {
    csn: { fetched: 0, inserted: 0, errors: 0 },
    usgs: { fetched: 0, inserted: 0, errors: 0 },
    deduped: 0,
  };

  let csnEventos: SismoNormalizado[] = [];
  let csnPreciso = true;
  try {
    const raw = await fetchCsnRecent();
    csnEventos = raw.map(normalizeCsnSismo);
    summary.csn.fetched = csnEventos.length;
  } catch (error) {
    console.error(
      "[ingest] CSN fetch failed, intentando respaldo GAEL:",
      error,
    );
    summary.csn.errors = 1;
    csnPreciso = false;
    try {
      const rawGael = await fetchGaelRecent();
      // `fetched` cuenta lo que entregó la fuente, no lo que sobrevivió a la
      // geocodificación — igual que en la rama precisa — para que el descarte
      // sea visible en la respuesta del cron.
      summary.csn.fetched = rawGael.length;
      csnEventos = rawGael
        .map((raw) => {
          const evento = normalizeGaelSismo(raw);
          if (!evento) {
            console.warn(
              `[ingest] GAEL: evento descartado, no se pudo geocodificar o traía datos inválidos: "${raw.RefGeografica}" (M${raw.Magnitud}, prof ${raw.Profundidad}, ${raw.Fecha})`,
            );
          }
          return evento;
        })
        .filter((evento): evento is SismoNormalizado => evento !== null);
    } catch (gaelError) {
      console.error("[ingest] GAEL fetch failed:", gaelError);
    }
  }

  let usgsEventos: SismoNormalizado[] = [];
  try {
    const raw = await fetchUsgsRecent();
    usgsEventos = raw.map(normalizeUsgsFeature);
    summary.usgs.fetched = usgsEventos.length;
  } catch (error) {
    console.error("[ingest] USGS fetch failed:", error);
    summary.usgs.errors = 1;
  }

  const since = new Date(Date.now() - DEDUPE_WINDOW_MS);
  const desdeReconciliacion = new Date(Date.now() - RECONCILIACION_LOOKBACK_MS);

  for (const evento of csnEventos) {
    if (csnPreciso) {
      const aproximadoCandidatos =
        await findRecentAproximados(desdeReconciliacion);
      const matchAproximado = findDuplicate(
        evento,
        aproximadoCandidatos as SismoNormalizado[],
      );
      if (matchAproximado) {
        let reconciliado = false;
        try {
          const resultado = await reemplazarConPrecision(
            matchAproximado.externalId,
            evento,
          );
          reconciliado = resultado !== null;
        } catch (error) {
          console.error("[ingest] reconciliación con aproximado falló:", error);
        }
        if (reconciliado) {
          summary.csn.inserted += 1;
          continue;
        }
        // No se pudo reconciliar (0 filas afectadas o error): degradar a
        // insertar/deduplicar como si no hubiera match aproximado, para no
        // perder el evento.
      }
    } else {
      // Respaldo GAEL activo. El feed de GAEL devuelve los ~15 últimos sismos
      // nacionales sin filtro de fecha, y su ID sintético nunca coincide con
      // el ID real de xor.cl, así que sin este chequeo cada failover
      // insertaría una fila aproximada duplicada por cada evento que ya
      // habíamos guardado con precisión (y volvería a notificarlo).
      const csnCandidatos = await findRecentByFuente(
        "csn",
        desdeReconciliacion,
      );
      const matchPreciso = findDuplicate(
        evento,
        csnCandidatos.filter(
          (c) => !c.ubicacionAproximada,
        ) as SismoNormalizado[],
      );
      if (matchPreciso) {
        // Ya existe la versión precisa de este sismo: la lectura aproximada
        // de GAEL no aporta nada y no debe volver a notificar.
        continue;
      }

      const matchAproximado = findDuplicate(
        evento,
        csnCandidatos.filter(
          (c) => c.ubicacionAproximada,
        ) as SismoNormalizado[],
      );
      if (matchAproximado && matchAproximado.externalId !== evento.externalId) {
        // Mismo evento releído desde GAEL con otro ID sintético (CSN revisó la
        // magnitud, la referencia geográfica o la hora entre polls): se
        // actualiza la fila aproximada existente, sin crear un duplicado y sin
        // notificar de nuevo.
        try {
          const actualizado = await actualizarAproximadoExistente(
            matchAproximado.externalId,
            evento,
          );
          if (actualizado) continue;
        } catch (error) {
          console.error(
            "[ingest] no se pudo actualizar el aproximado existente:",
            error,
          );
        }
        // Si falló (0 filas o conflicto de external_id porque el ID nuevo ya
        // existe en otra fila), se cae al upsert de abajo, que en ese caso
        // actualiza esa otra fila en vez de insertar una nueva.
      }
    }

    const usgsCandidatos = await findRecentByFuente("usgs", since);
    const match = findDuplicate(evento, usgsCandidatos as SismoNormalizado[]);
    if (match) {
      await replaceWithCsn(match.externalId, evento);
      summary.deduped += 1;
    } else {
      const { esNuevo } = await upsertSismo(evento);
      summary.csn.inserted += 1;
      if (esNuevo && evento.magnitud >= 4) {
        try {
          await enviarPushParaSismo(evento);
        } catch (error) {
          console.error("[ingest] push notification failed:", error);
        }
      }
    }
  }

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

  try {
    await revisarAlertaCsn();
  } catch (error) {
    console.error("[ingest] revisión de alerta CSN falló:", error);
  }

  return summary;
}

const UMBRAL_ALERTA_CSN_MS = 2 * 60 * 60 * 1000;

async function revisarAlertaCsn(): Promise<void> {
  const ultimoPreciso = await findUltimoCsnPreciso();
  const antiguedadMs = ultimoPreciso
    ? Date.now() - ultimoPreciso.getTime()
    : Infinity;
  if (antiguedadMs < UMBRAL_ALERTA_CSN_MS) return;

  const ultimaAlerta = await getUltimaAlertaEnviada("csn");
  if (
    ultimaAlerta &&
    Date.now() - ultimaAlerta.getTime() < UMBRAL_ALERTA_CSN_MS
  ) {
    return;
  }

  const horas = Math.round(antiguedadMs / (60 * 60 * 1000));
  await enviarAlertaAdmin(
    `CSN (xor.cl) lleva ${horas}h sin actualizar datos precisos.`,
  );
  await marcarAlertaEnviada("csn");
}
