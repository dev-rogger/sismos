import {
  findDuplicate,
  normalizeCsnSismo,
  normalizeUsgsFeature,
  type SismoNormalizado,
} from "@sismos/shared";
import {
  findRecentByFuente,
  replaceWithCsn,
  setRefCruzada,
  upsertSismo,
} from "@sismos/db";
import { fetchCsnRecent } from "./fetch-csn";
import { fetchUsgsRecent } from "./fetch-usgs";
import { enviarPushParaSismo } from "./send-push";

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

export async function runIngest(): Promise<IngestSummary> {
  const summary: IngestSummary = {
    csn: { fetched: 0, inserted: 0, errors: 0 },
    usgs: { fetched: 0, inserted: 0, errors: 0 },
    deduped: 0,
  };

  let csnEventos: SismoNormalizado[] = [];
  try {
    const raw = await fetchCsnRecent();
    csnEventos = raw.map(normalizeCsnSismo);
    summary.csn.fetched = csnEventos.length;
  } catch (error) {
    console.error("[ingest] CSN fetch failed:", error);
    summary.csn.errors = 1;
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

  for (const evento of csnEventos) {
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
      await upsertSismo(evento);
      summary.usgs.inserted += 1;
    }
  }

  return summary;
}
