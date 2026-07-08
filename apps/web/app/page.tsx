import { getUltimos10Dias } from "../lib/fetch-sismos";
import type { SismoMapa } from "../lib/tipos-sismo";
import MapaConHistorial from "../components/MapaConHistorial";

export const dynamic = "force-dynamic";

export default async function Home() {
  let sismosIniciales: SismoMapa[] = [];
  try {
    const sismos = await getUltimos10Dias();
    sismosIniciales = sismos.map((s) => ({
      externalId: s.externalId,
      fecha: s.fecha.toISOString(),
      magnitud: s.magnitud,
      latitud: s.latitud,
      longitud: s.longitud,
      lugar: s.lugar,
      bandera: s.bandera ?? null,
    }));
  } catch (error) {
    console.error("[page] failed to load initial sismos:", error);
  }

  return (
    <main className="flex h-screen w-screen flex-col lg:flex-row">
      <MapaConHistorial sismosIniciales={sismosIniciales} />
    </main>
  );
}
