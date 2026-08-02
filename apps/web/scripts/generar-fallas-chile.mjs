import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const BOUNDS = { minLon: -76, maxLon: -66, minLat: -56, maxLat: -17.3 };
const URL_GEM =
  "https://raw.githubusercontent.com/GEMScienceTools/gem-global-active-faults/master/geojson/gem_active_faults.geojson";
const SALIDA = path.join("public", "data", "fallas-chile.geojson");

function dentroDeChile(coords) {
  if (Array.isArray(coords) && typeof coords[0] === "number") {
    const [lon, lat] = coords;
    return (
      lon >= BOUNDS.minLon &&
      lon <= BOUNDS.maxLon &&
      lat >= BOUNDS.minLat &&
      lat <= BOUNDS.maxLat
    );
  }
  if (Array.isArray(coords)) {
    return coords.some((c) => dentroDeChile(c));
  }
  return false;
}

async function main() {
  console.log(`Descargando ${URL_GEM}...`);
  const res = await fetch(URL_GEM);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const data = await res.json();

  const features = data.features
    .filter((f) => dentroDeChile(f.geometry.coordinates))
    .map((f) => ({
      type: "Feature",
      geometry: f.geometry,
      properties: { name: f.properties.name ?? null },
    }));

  const geojson = { type: "FeatureCollection", features };
  mkdirSync(path.dirname(SALIDA), { recursive: true });
  writeFileSync(SALIDA, JSON.stringify(geojson));
  console.log(`${features.length} fallas escritas en ${SALIDA}`);
}

main();
