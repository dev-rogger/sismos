import { normalizeUsgsFeature, type UsgsFeatureRaw } from "@sismos/shared";
import { upsertSismo } from "@sismos/db";

// Backfill puntual para recuperar sismos mundiales (USGS) fuera del alcance
// del feed en vivo (apps/ingestor/lib/fetch-usgs.ts), que solo cubre las
// últimas 24h con magnitud >=4.5. Útil tras un hueco de ingesta (caída de DB,
// migración de proveedor) o para acumular historial desde cero.
//
// Uso: tsx --env-file=.env.local scripts/backfill-usgs-rango.ts [desde] [magnitudMinima]
//   desde: fecha ISO, default 1 de enero del año actual
//   magnitudMinima: default 4.5 (mismo umbral que el feed en vivo)

interface UsgsQueryResponse {
  features: UsgsFeatureRaw[];
}

async function main() {
  const desde = process.argv[2] ?? `${new Date().getUTCFullYear()}-01-01`;
  const magnitudMinima = Number(process.argv[3] ?? 4.5);

  const url =
    "https://earthquake.usgs.gov/fdsnws/event/1/query" +
    "?format=geojson" +
    `&starttime=${desde}` +
    `&minmagnitude=${magnitudMinima}`;

  console.log(`Consultando USGS desde ${desde}, magnitud >= ${magnitudMinima}...`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`USGS fetch failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as UsgsQueryResponse;
  console.log(`Recibidos ${data.features.length} eventos de USGS.`);

  let nuevos = 0;
  let actualizados = 0;
  for (const raw of data.features) {
    const evento = normalizeUsgsFeature(raw);
    const { esNuevo } = await upsertSismo(evento);
    if (esNuevo) nuevos++;
    else actualizados++;
  }

  console.log(`Listo: ${nuevos} insertados, ${actualizados} ya existían (actualizados).`);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
