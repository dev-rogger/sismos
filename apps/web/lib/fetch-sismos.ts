import {
  findUltimos10Dias,
  findSismosSince,
  findTop10UltimosAnios,
  findTopHistoricos,
  findResumenPeriodo,
  findConteoPorPeriodo,
  type Sismo,
  type SismoHistorico,
  type GranularidadConteo,
  type ConteoPeriodo,
  type ResumenPeriodo,
} from "@sismos/db";

export async function getUltimos10Dias(): Promise<Sismo[]> {
  return findUltimos10Dias();
}

export async function getSismosDesde(since: Date): Promise<Sismo[]> {
  return findSismosSince(since);
}

export async function getTop10UltimosAnios(): Promise<Sismo[]> {
  return findTop10UltimosAnios(10);
}

export async function getTopHistoricos(
  soloChile: boolean,
): Promise<SismoHistorico[]> {
  return findTopHistoricos(soloChile ? "chile" : "mundial");
}

export async function getResumenPeriodo(
  dias: number,
  soloChile: boolean,
  limite: number,
): Promise<ResumenPeriodo> {
  return findResumenPeriodo(dias, soloChile, limite);
}

export async function getConteoPorPeriodo(
  granularidad: GranularidadConteo,
  desde: Date,
  soloChile: boolean,
): Promise<ConteoPeriodo[]> {
  return findConteoPorPeriodo(granularidad, desde, soloChile);
}
