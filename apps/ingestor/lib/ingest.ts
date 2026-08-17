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
    console.error("[ingest] CSN fetch failed, intentando respaldo GAEL:", error);
    summary.csn.errors = 1;
    csnPreciso = false;
    try {
      const rawGael = await fetchGaelRecent();
      csnEventos = rawGael
        .map(normalizeGaelSismo)
        .filter((evento): evento is SismoNormalizado => evento !== null);
      summary.csn.fetched = csnEventos.length;
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
      const aproximadoCandidatos = await findRecentAproximados(
        desdeReconciliacion,
      );
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
  await enviarAlertaAdmin(`CSN (xor.cl) lleva ${horas}h sin actualizar datos precisos.`);
  await marcarAlertaEnviada("csn");
}
