import { getUltimos10Dias } from "../lib/fetch-sismos";
import type { SismoMapa, SismoSeleccionado } from "../lib/tipos-sismo";
import MapaConHistorial from "../components/MapaConHistorial";

export const dynamic = "force-dynamic";

interface HomeProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function parseSismoDesdeQuery(params: {
  [key: string]: string | string[] | undefined;
}): SismoSeleccionado | null {
  const externalId = typeof params.sismo === "string" ? params.sismo : null;
  const lugar = typeof params.lugar === "string" ? params.lugar : null;
  const lat = typeof params.lat === "string" ? Number(params.lat) : NaN;
  const lon = typeof params.lon === "string" ? Number(params.lon) : NaN;
  const mag = typeof params.mag === "string" ? Number(params.mag) : NaN;
  // La profundidad es opcional: alimenta el radio de percepción, pero un
  // deep link viejo (o de otra fuente) puede no traerla.
  const prof = typeof params.prof === "string" ? Number(params.prof) : NaN;

  if (
    !externalId ||
    !lugar ||
    Number.isNaN(lat) ||
    Number.isNaN(lon) ||
    Number.isNaN(mag)
  ) {
    return null;
  }
  return {
    externalId,
    latitud: lat,
    longitud: lon,
    magnitud: mag,
    lugar,
    ...(Number.isNaN(prof) ? {} : { profundidadKm: prof }),
  };
}

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const sismoInicial = parseSismoDesdeQuery(params);

  let sismosIniciales: SismoMapa[] = [];
  let errorCargaInicial = false;
  try {
    const sismos = await getUltimos10Dias();
    sismosIniciales = sismos.map((s) => ({
      externalId: s.externalId,
      fecha: s.fecha.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      magnitud: s.magnitud,
      latitud: s.latitud,
      longitud: s.longitud,
      lugar: s.lugar,
      bandera: s.bandera ?? null,
      profundidadKm: s.profundidadKm,
      ubicacionAproximada: s.ubicacionAproximada,
    }));
  } catch (error) {
    console.error("[page] failed to load initial sismos:", error);
    errorCargaInicial = true;
  }

  return (
    <main className="flex h-dvh w-screen flex-col lg:flex-row">
      <MapaConHistorial
        sismosIniciales={sismosIniciales}
        sismoInicial={sismoInicial}
        errorCargaInicial={errorCargaInicial}
      />
    </main>
  );
}
