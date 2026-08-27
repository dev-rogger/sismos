import { and, desc, eq, gt, gte, asc, sql, getTableColumns } from "drizzle-orm";
import type { SismoFuente, SismoNormalizado } from "@sismos/shared";
import { getDb } from "../connection";
import { sismos } from "../schema";

export interface Sismo {
  id: number;
  fuente: SismoFuente;
  externalId: string;
  fecha: Date;
  magnitud: number;
  profundidadKm: number;
  latitud: number;
  longitud: number;
  lugar: string;
  bandera: string | null;
  refCruzada: { fuente: SismoFuente; externalId: string } | null;
  createdAt: Date;
  updatedAt: Date;
  ubicacionAproximada: boolean;
}

function toSismo(row: typeof sismos.$inferSelect): Sismo {
  return {
    id: row.id,
    fuente: row.fuente as SismoFuente,
    externalId: row.externalId,
    fecha: row.fecha,
    magnitud: row.magnitud,
    profundidadKm: row.profundidadKm,
    latitud: row.latitud,
    longitud: row.longitud,
    lugar: row.lugar,
    bandera: row.bandera,
    refCruzada:
      row.refCruzadaFuente && row.refCruzadaExternalId
        ? {
            fuente: row.refCruzadaFuente as SismoFuente,
            externalId: row.refCruzadaExternalId,
          }
        : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ubicacionAproximada: row.ubicacionAproximada,
  };
}

export async function findRecentByFuente(
  fuente: SismoFuente,
  since: Date,
): Promise<Sismo[]> {
  const rows = await getDb()
    .select()
    .from(sismos)
    .where(and(eq(sismos.fuente, fuente), gte(sismos.fecha, since)));
  return rows.map(toSismo);
}

export async function findRecentAproximados(since: Date): Promise<Sismo[]> {
  const rows = await getDb()
    .select()
    .from(sismos)
    .where(
      and(
        eq(sismos.fuente, "csn"),
        eq(sismos.ubicacionAproximada, true),
        gte(sismos.fecha, since),
      ),
    );
  return rows.map(toSismo);
}

export interface ResultadoUpsertSismo {
  sismo: Sismo;
  esNuevo: boolean;
}

export async function upsertSismo(
  evento: SismoNormalizado,
): Promise<ResultadoUpsertSismo> {
  const now = new Date();
  const [row] = await getDb()
    .insert(sismos)
    .values({
      fuente: evento.fuente,
      externalId: evento.externalId,
      fecha: evento.fecha,
      magnitud: evento.magnitud,
      profundidadKm: evento.profundidadKm,
      latitud: evento.latitud,
      longitud: evento.longitud,
      lugar: evento.lugar,
      bandera: evento.bandera,
      ubicacionAproximada: evento.ubicacionAproximada,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [sismos.fuente, sismos.externalId],
      set: {
        fecha: evento.fecha,
        magnitud: evento.magnitud,
        profundidadKm: evento.profundidadKm,
        latitud: evento.latitud,
        longitud: evento.longitud,
        lugar: evento.lugar,
        bandera: evento.bandera,
        ubicacionAproximada: evento.ubicacionAproximada,
        updatedAt: now,
      },
    })
    // xmax = 0 solo es cierto para la fila recién insertada en esta misma
    // transacción; si el conflicto disparó el UPDATE, xmax queda distinto
    // de 0. Es el truco estándar de Postgres para distinguir insert/update
    // en un upsert, necesario porque CSN devuelve una lista "recent" que
    // reincluye sismos ya guardados en cada corrida del ingestor.
    .returning({
      ...getTableColumns(sismos),
      esNuevo: sql<boolean>`(xmax = 0)`,
    });
  if (!row) {
    throw new Error(
      "upsertSismo: insert...onConflictDoUpdate returned no row unexpectedly",
    );
  }
  const { esNuevo, ...columnas } = row;
  return { sismo: toSismo(columnas), esNuevo };
}

export async function setRefCruzada(
  fuente: SismoFuente,
  externalId: string,
  refCruzada: { fuente: SismoFuente; externalId: string },
): Promise<Sismo | null> {
  const [row] = await getDb()
    .update(sismos)
    .set({
      refCruzadaFuente: refCruzada.fuente,
      refCruzadaExternalId: refCruzada.externalId,
      updatedAt: new Date(),
    })
    .where(and(eq(sismos.fuente, fuente), eq(sismos.externalId, externalId)))
    .returning();
  return row ? toSismo(row) : null;
}

export async function replaceWithCsn(
  usgsExternalId: string,
  csnEvento: SismoNormalizado,
): Promise<Sismo | null> {
  const [row] = await getDb()
    .update(sismos)
    .set({
      fuente: csnEvento.fuente,
      externalId: csnEvento.externalId,
      fecha: csnEvento.fecha,
      magnitud: csnEvento.magnitud,
      profundidadKm: csnEvento.profundidadKm,
      latitud: csnEvento.latitud,
      longitud: csnEvento.longitud,
      lugar: csnEvento.lugar,
      bandera: csnEvento.bandera,
      ubicacionAproximada: csnEvento.ubicacionAproximada,
      refCruzadaFuente: "usgs",
      refCruzadaExternalId: usgsExternalId,
      updatedAt: new Date(),
    })
    .where(
      and(eq(sismos.fuente, "usgs"), eq(sismos.externalId, usgsExternalId)),
    )
    .returning();
  return row ? toSismo(row) : null;
}

// Pisa una fila 'csn' existente (identificada por su external_id actual) con
// los datos de otra lectura del mismo evento. `ubicacionAproximada` se toma
// del evento nuevo: la reconciliación con xor.cl la baja a false, mientras que
// una relectura vía GAEL la mantiene en true.
async function actualizarFilaCsn(
  externalIdActual: string,
  evento: SismoNormalizado,
): Promise<Sismo | null> {
  const [row] = await getDb()
    .update(sismos)
    .set({
      externalId: evento.externalId,
      fecha: evento.fecha,
      magnitud: evento.magnitud,
      profundidadKm: evento.profundidadKm,
      latitud: evento.latitud,
      longitud: evento.longitud,
      lugar: evento.lugar,
      bandera: evento.bandera,
      ubicacionAproximada: evento.ubicacionAproximada,
      updatedAt: new Date(),
    })
    .where(
      and(eq(sismos.fuente, "csn"), eq(sismos.externalId, externalIdActual)),
    )
    .returning();
  return row ? toSismo(row) : null;
}

export async function reemplazarConPrecision(
  externalIdAproximado: string,
  eventoPreciso: SismoNormalizado,
): Promise<Sismo | null> {
  return actualizarFilaCsn(externalIdAproximado, {
    ...eventoPreciso,
    ubicacionAproximada: false,
  });
}

// Mismo evento releído desde GAEL con un ID sintético distinto (ej. CSN revisó
// la magnitud entre polls): actualiza la fila aproximada existente en vez de
// insertar una segunda fila aproximada duplicada.
export async function actualizarAproximadoExistente(
  externalIdExistente: string,
  eventoAproximado: SismoNormalizado,
): Promise<Sismo | null> {
  return actualizarFilaCsn(externalIdExistente, eventoAproximado);
}

export async function findUltimos10Dias(): Promise<Sismo[]> {
  const since = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  const rows = await getDb()
    .select()
    .from(sismos)
    .where(gte(sismos.fecha, since))
    .orderBy(desc(sismos.fecha));
  return rows.map(toSismo);
}

// Filtra por updatedAt, no por fecha: upsertSismo() actualiza updatedAt tanto
// en inserts como en updates, así que esto también trae sismos ya vistos
// cuyos magnitud/profundidadKm/etc. fueron revisados por CSN/USGS después
// del evento (su `fecha` original no cambia, pero updatedAt sí avanza).
export async function findSismosSince(since: Date): Promise<Sismo[]> {
  const rows = await getDb()
    .select()
    .from(sismos)
    .where(gt(sismos.updatedAt, since))
    .orderBy(asc(sismos.updatedAt));
  return rows.map(toSismo);
}

export async function findTop10UltimosAnios(anios: number): Promise<Sismo[]> {
  const since = new Date();
  since.setFullYear(since.getFullYear() - anios);
  const rows = await getDb()
    .select()
    .from(sismos)
    .where(gte(sismos.fecha, since))
    .orderBy(desc(sismos.magnitud))
    .limit(10);
  return rows.map(toSismo);
}

export async function findUltimoCsnPreciso(): Promise<Date | null> {
  const [row] = await getDb()
    .select({ actualizado: sismos.updatedAt })
    .from(sismos)
    .where(and(eq(sismos.fuente, "csn"), eq(sismos.ubicacionAproximada, false)))
    .orderBy(desc(sismos.updatedAt))
    .limit(1);
  return row?.actualizado ?? null;
}

// A diferencia de findUltimos10Dias (número fijo, usado por el historial ya
// existente), esta es genérica para la pantalla de Estadísticas: necesita
// tanto "últimos 7 días" para el listado como filtrar por Chile/mundial, algo
// que findUltimos10Dias no soporta.
export async function findUltimosDias(
  dias: number,
  soloChile: boolean,
): Promise<Sismo[]> {
  const since = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  const condiciones = soloChile
    ? and(gte(sismos.fecha, since), eq(sismos.bandera, "🇨🇱"))
    : gte(sismos.fecha, since);
  const rows = await getDb()
    .select()
    .from(sismos)
    .where(condiciones)
    .orderBy(desc(sismos.fecha));
  return rows.map(toSismo);
}

export type GranularidadConteo = "dia" | "semana" | "mes" | "anio";

const UNIDAD_POSTGRES: Record<GranularidadConteo, string> = {
  dia: "day",
  semana: "week",
  mes: "month",
  anio: "year",
};

export interface ConteoPeriodo {
  periodo: Date;
  total: number;
}

// Cuenta sismos agrupados por día/semana/mes/año, para los gráficos de
// actividad de la pantalla de Estadísticas. `date_trunc` corre en Postgres
// (no se trae todas las filas a JS a sumar a mano) — con el volumen real
// (miles de sismos "leves" detectados por CSN) traer todo sería lento y
// pesado para nada, el conteo ya lo hace la base de datos.
export async function findConteoPorPeriodo(
  granularidad: GranularidadConteo,
  desde: Date,
  soloChile: boolean,
): Promise<ConteoPeriodo[]> {
  // `unidad` sale de UNIDAD_POSTGRES (4 valores fijos nuestros, nunca del
  // usuario) así que va como literal SQL, no como bind parameter: pasado
  // como parámetro, Postgres no logra inferir su tipo dentro de
  // date_trunc() en el protocolo extendido (falla con "could not determine
  // data type of parameter" — probado a mano contra la base local).
  const unidad = UNIDAD_POSTGRES[granularidad];
  const truncado = sql`date_trunc(${sql.raw(`'${unidad}'`)}, ${sismos.fecha})`;
  const condiciones = soloChile
    ? and(gte(sismos.fecha, desde), eq(sismos.bandera, "🇨🇱"))
    : gte(sismos.fecha, desde);
  const rows = await getDb()
    .select({
      periodo: truncado.as("periodo"),
      total: sql<number>`count(*)::int`.as("total"),
    })
    .from(sismos)
    .where(condiciones)
    .groupBy(truncado)
    .orderBy(truncado);
  return rows.map((r) => ({ periodo: r.periodo as Date, total: r.total }));
}
