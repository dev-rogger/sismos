import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeUsgsFeature,
  type UsgsFeatureRaw,
} from "@sismos/shared";
import {
  getMongooseConnection,
  upsertSismoHistorico,
  type SismoHistoricoInput,
} from "@sismos/db";

const USGS_HISTORICAL_URL =
  "https://earthquake.usgs.gov/fdsnws/event/1/query" +
  "?format=geojson" +
  "&starttime=1900-01-01" +
  "&minlatitude=-56&maxlatitude=-17&minlongitude=-76&maxlongitude=-66" +
  "&orderby=magnitude" +
  "&limit=15";

const TOP_N = 10;

interface UsgsQueryResponse {
  features: UsgsFeatureRaw[];
}

interface Override {
  latitud?: number;
  longitud?: number;
  magnitud?: number;
  lugar?: string;
  fecha?: string;
}

function loadOverrides(): Record<string, Override> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const overridesPath = path.join(
    __dirname,
    "../data/historical-overrides.json",
  );
  const raw = readFileSync(overridesPath, "utf-8");
  return JSON.parse(raw) as Record<string, Override>;
}

async function fetchTopHistoricos(
  overrides: Record<string, Override>,
): Promise<SismoHistoricoInput[]> {
  const res = await fetch(USGS_HISTORICAL_URL);
  if (!res.ok) {
    throw new Error(`USGS fetch failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as UsgsQueryResponse;

  return data.features.slice(0, TOP_N).map((feature) => {
    const normalizado = normalizeUsgsFeature(feature);
    const override = overrides[normalizado.externalId] ?? {};
    if (Object.keys(override).length > 0) {
      console.log(`Applying override for ${normalizado.externalId}:`, override);
    }
    return {
      externalId: normalizado.externalId,
      fecha: override.fecha ? new Date(override.fecha) : normalizado.fecha,
      magnitud: override.magnitud ?? normalizado.magnitud,
      profundidadKm: normalizado.profundidadKm,
      latitud: override.latitud ?? normalizado.latitud,
      longitud: override.longitud ?? normalizado.longitud,
      lugar: override.lugar ?? normalizado.lugar,
      bandera: "🇨🇱",
    };
  });
}

async function main() {
  const overrides = loadOverrides();
  console.log(`Fetching top ${TOP_N} historical Chilean earthquakes from USGS...`);
  const eventos = await fetchTopHistoricos(overrides);

  await getMongooseConnection();

  let count = 0;
  for (const evento of eventos) {
    await upsertSismoHistorico(evento);
    count += 1;
    console.log(
      `Upserted ${evento.externalId} — ${evento.lugar} (M${evento.magnitud}, ${evento.fecha.toISOString()})`,
    );
  }

  console.log(`Done. Upserted ${count} historical events.`);
  process.exit(0);
}

main().catch((error) => {
  console.error("[backfill-historicos] failed:", error);
  process.exit(1);
});
