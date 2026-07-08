import { getMongooseConnection } from "@sismos/db";
import {
  findUltimos10Dias,
  findSismosSince,
  findTop10UltimosAnios,
  findTopHistoricos,
  type Sismo,
  type SismoHistorico,
} from "@sismos/db";

export async function getUltimos10Dias(): Promise<Sismo[]> {
  await getMongooseConnection();
  return findUltimos10Dias();
}

export async function getSismosDesde(since: Date): Promise<Sismo[]> {
  await getMongooseConnection();
  return findSismosSince(since);
}

export async function getTop10UltimosAnios(): Promise<Sismo[]> {
  await getMongooseConnection();
  return findTop10UltimosAnios(10);
}

export async function getTopHistoricos(): Promise<SismoHistorico[]> {
  await getMongooseConnection();
  return findTopHistoricos();
}
