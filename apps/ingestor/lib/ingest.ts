import {
  findDuplicate,
  normalizeCsnSismo,
  normalizeUsgsFeature,
  normalizeGaelSismo,
  decidirNotificacion,
  UMBRAL_MAGNITUD_MUNDIAL,
  type SismoNormalizado,
} from "@sismos/shared";
import {
  findRecentByFuentes,
  findUltimoCsnPreciso,
  marcarNotificado,
  type Sismo,
  replaceWithCsn,
  reemplazarConPrecision,
  actualizarAproximadoExistente,
  setRefCruzada,
  upsertSismo,
  getUltimaAlertaEnviada,
  marcarAlertaEnviada,
  registrarIngestaOk,
  registrarIngestaError,
  type FuenteIngesta,
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

// Registrar el estado de salud nunca debe romper ni frenar la ingesta.
async function okSeguro(fuente: FuenteIngesta): Promise<void> {
  try {
    await registrarIngestaOk(fuente);
  } catch (error) {
    console.error(`[ingest] no se pudo registrar ok de ${fuente}:`, error);
  }
}

async function errorSeguro(
  fuente: FuenteIngesta,
  error: unknown,
): Promise<void> {
  try {
    const msg = error instanceof Error ? error.message : String(error);
    await registrarIngestaError(fuente, msg);
  } catch (e) {
    console.error(`[ingest] no se pudo registrar error de ${fuente}:`, e);
  }
}

// Decide con el estado persistido de la fila (no con "es nuevo") y marca el
// sismo como notificado solo si el envío no lanzó. Si el push falla, la fila
// queda sin marcar y la siguiente corrida lo reintenta mientras no supere el
// tope de antigüedad de decidirNotificacion.
//
// Riesgo aceptado (no hay reclamo atómico): si dos corridas del ingestor se
// solapan, ambas pueden leer la fila sin marcar y avisar dos veces. Es raro
// (el cron corre cada 5 min y una corrida dura segundos) y el daño se acota
// porque el push lleva `topic` y `tag` por sismo, con lo que el servicio de
// push y el navegador reemplazan el aviso repetido en vez de apilarlo.
async function notificarSiCorresponde(
  evento: SismoNormalizado,
  fila: Sismo,
): Promise<void> {
  const decision = decidirNotificacion({
    magnitud: evento.magnitud,
    fecha: evento.fecha,
    fuente: fila.fuente,
    notificadoAt: fila.notificadoAt,
    magnitudNotificada: fila.magnitudNotificada,
    fuenteNotificada: fila.fuenteNotificada,
    ahora: new Date(),
  });
  if (!decision.enviar) return;
  // Fila CSN ya avisada solo como USGS por un sismo que superó el umbral
  // mundial: los suscriptores de alcance mundial ya recibieron ese aviso, así
  // que se les omite para no duplicarlo.
  const yaAvisadoComoMundial =
    fila.fuente === "csn" &&
    fila.notificadoAt !== null &&
    fila.fuenteNotificada !== null &&
    fila.fuenteNotificada !== "csn" &&
    fila.magnitudNotificada !== null &&
    fila.magnitudNotificada >= UMBRAL_MAGNITUD_MUNDIAL;
  try {
    await enviarPushParaSismo(evento, {
      motivo: decision.motivo ?? "nuevo",
      ...(yaAvisadoComoMundial ? { omitirAlcanceMundial: true } : {}),
    });
  } catch (error) {
    console.error("[ingest] push notification failed:", error);
    await errorSeguro("push", error);
    return;
  }
  await okSeguro("push");
  try {
    await marcarNotificado(
      fila.fuente,
      fila.externalId,
      evento.magnitud,
      evento.fuente,
    );
  } catch (error) {
    console.error("[ingest] no se pudo marcar el sismo como notificado:", error);
  }
}

// Mantiene la lista en memoria coherente con la BD tras cada escritura, para
// que dos eventos del mismo ciclo no se dupliquen ni lean estado viejo.
function guardarEnLista(
  lista: Sismo[],
  fuenteAnterior: Sismo["fuente"],
  externalIdAnterior: string,
  fila: Sismo,
): void {
  const i = lista.findIndex(
    (c) =>
      c.fuente === fuenteAnterior && c.externalId === externalIdAnterior,
  );
  if (i >= 0) lista[i] = fila;
  else lista.push(fila);
}

export async function runIngest(): Promise<IngestSummary> {
  const summary: IngestSummary = {
    csn: { fetched: 0, inserted: 0, errors: 0 },
    usgs: { fetched: 0, inserted: 0, errors: 0 },
    deduped: 0,
  };

  let csnEventos: SismoNormalizado[] = [];
  let csnPreciso = true;
  // Alguna fuente nacional (CSN o el respaldo GAEL) respondió en este ciclo.
  let nacionalRespondio = true;
  try {
    const raw = await fetchCsnRecent();
    csnEventos = raw.map(normalizeCsnSismo);
    summary.csn.fetched = csnEventos.length;
  } catch (error) {
    await errorSeguro("csn", error);
    console.error(
      "[ingest] CSN fetch failed, intentando respaldo GAEL:",
      error,
    );
    summary.csn.errors = 1;
    csnPreciso = false;
    nacionalRespondio = false;
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
      nacionalRespondio = true;
      await okSeguro("gael");
    } catch (gaelError) {
      console.error("[ingest] GAEL fetch failed:", gaelError);
      await errorSeguro("gael", gaelError);
    }
  }

  let usgsEventos: SismoNormalizado[] = [];
  try {
    const raw = await fetchUsgsRecent();
    usgsEventos = raw.map(normalizeUsgsFeature);
    summary.usgs.fetched = usgsEventos.length;
    await okSeguro("usgs");
  } catch (error) {
    console.error("[ingest] USGS fetch failed:", error);
    await errorSeguro("usgs", error);
    summary.usgs.errors = 1;
  }

  const since = new Date(Date.now() - DEDUPE_WINDOW_MS);
  const desdeReconciliacion = new Date(Date.now() - RECONCILIACION_LOOKBACK_MS);

  // Una sola carga de candidatos para todo el ciclo (antes: una consulta por
  // evento). Se filtra en memoria y se mantiene al día tras cada escritura.
  const candidatos = await findRecentByFuentes(
    ["csn", "usgs"],
    desdeReconciliacion,
  );

  for (const evento of csnEventos) {
    if (csnPreciso) {
      const aproximadoCandidatos = candidatos.filter(
        (c) => c.fuente === "csn" && c.ubicacionAproximada,
      );
      const matchAproximado = findDuplicate(
        evento,
        aproximadoCandidatos as SismoNormalizado[],
      );
      if (matchAproximado) {
        let reconciliado: Sismo | null = null;
        try {
          reconciliado = await reemplazarConPrecision(
            matchAproximado.externalId,
            evento,
          );
        } catch (error) {
          console.error("[ingest] reconciliación con aproximado falló:", error);
        }
        if (reconciliado) {
          guardarEnLista(
            candidatos,
            "csn",
            matchAproximado.externalId,
            reconciliado,
          );
          summary.csn.inserted += 1;
          // La fila aproximada pudo haberse notificado ya (entonces solo
          // re-avisa si la magnitud subió >= 0.5) o no (entonces avisa ahora).
          await notificarSiCorresponde(evento, reconciliado);
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
      const csnCandidatos = candidatos.filter((c) => c.fuente === "csn");
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
          if (actualizado) {
            guardarEnLista(
              candidatos,
              "csn",
              matchAproximado.externalId,
              actualizado,
            );
            // Estado persistido: no re-avisa salvo que nunca se haya avisado
            // o la magnitud haya subido >= 0.5.
            await notificarSiCorresponde(evento, actualizado);
            continue;
          }
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

    const usgsCandidatos = candidatos.filter(
      (c) => c.fuente === "usgs" && c.fecha >= since,
    );
    const match = findDuplicate(evento, usgsCandidatos as SismoNormalizado[]);
    if (match) {
      const reemplazada = await replaceWithCsn(match.externalId, evento);
      summary.deduped += 1;
      if (reemplazada) {
        guardarEnLista(candidatos, "usgs", match.externalId, reemplazada);
        // La fila conserva el estado de notificación de la fila USGS: si
        // nunca se avisó y supera el piso de Chile, avisa una sola vez.
        await notificarSiCorresponde(evento, reemplazada);
      }
    } else {
      const { sismo } = await upsertSismo(evento);
      guardarEnLista(candidatos, sismo.fuente, sismo.externalId, sismo);
      summary.csn.inserted += 1;
      await notificarSiCorresponde(evento, sismo);
    }
  }

  for (const evento of usgsEventos) {
    const csnCandidatos = candidatos.filter(
      (c) => c.fuente === "csn" && c.fecha >= since,
    );
    const match = findDuplicate(evento, csnCandidatos as SismoNormalizado[]);
    if (match) {
      await setRefCruzada(match.fuente, match.externalId, {
        fuente: evento.fuente,
        externalId: evento.externalId,
      });
      summary.deduped += 1;
    } else {
      const { sismo } = await upsertSismo(evento);
      guardarEnLista(candidatos, sismo.fuente, sismo.externalId, sismo);
      summary.usgs.inserted += 1;
      await notificarSiCorresponde(evento, sismo);
    }
  }

  try {
    await revisarAlertaCsn();
  } catch (error) {
    console.error("[ingest] revisión de alerta CSN falló:", error);
  }

  // "csn ok" = la ingesta corrió hasta el final y alguna fuente nacional (CSN
  // preciso o el respaldo GAEL) respondió. Si ambas fallaron, el error de csn
  // ya quedó registrado arriba y no se pisa con un ok: así /api/health lo
  // refleja. Que CSN esté desactualizado lo cubre la alerta de 2h.
  if (nacionalRespondio) await okSeguro("csn");

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
