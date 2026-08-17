import {
  pgTable,
  serial,
  text,
  timestamp,
  real,
  doublePrecision,
  boolean,
  unique,
} from "drizzle-orm/pg-core";

export const sismos = pgTable(
  "sismos",
  {
    id: serial("id").primaryKey(),
    fuente: text("fuente").notNull(),
    externalId: text("external_id").notNull(),
    fecha: timestamp("fecha").notNull(),
    magnitud: real("magnitud").notNull(),
    profundidadKm: real("profundidad_km").notNull(),
    latitud: doublePrecision("latitud").notNull(),
    longitud: doublePrecision("longitud").notNull(),
    lugar: text("lugar").notNull(),
    bandera: text("bandera"),
    refCruzadaFuente: text("ref_cruzada_fuente"),
    refCruzadaExternalId: text("ref_cruzada_external_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    ubicacionAproximada: boolean("ubicacion_aproximada").notNull().default(false),
  },
  (table) => [
    unique("sismos_fuente_external_id_unique").on(
      table.fuente,
      table.externalId,
    ),
  ],
);

export const sismosHistoricos = pgTable(
  "sismos_historicos",
  {
    id: serial("id").primaryKey(),
    externalId: text("external_id").notNull(),
    // "mundial" | "chile" — the same event can legitimately appear once per
    // scope (e.g. Valdivia 1960 is top-10 both worldwide and in Chile).
    alcance: text("alcance").notNull().default("mundial"),
    fecha: timestamp("fecha").notNull(),
    magnitud: real("magnitud").notNull(),
    profundidadKm: real("profundidad_km").notNull(),
    latitud: doublePrecision("latitud").notNull(),
    longitud: doublePrecision("longitud").notNull(),
    lugar: text("lugar").notNull(),
    bandera: text("bandera"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("sismos_historicos_external_id_alcance_unique").on(
      table.externalId,
      table.alcance,
    ),
  ],
);

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  magnitudMinima: real("magnitud_minima").notNull().default(4),
  centroLat: doublePrecision("centro_lat"),
  centroLon: doublePrecision("centro_lon"),
  radioKm: real("radio_km"),
  alcanceMundial: boolean("alcance_mundial").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const estadoIngesta = pgTable("estado_ingesta", {
  fuente: text("fuente").primaryKey(),
  ultimaAlertaEnviada: timestamp("ultima_alerta_enviada"),
});
