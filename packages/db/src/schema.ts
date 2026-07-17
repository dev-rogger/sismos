import {
  pgTable,
  serial,
  text,
  timestamp,
  real,
  doublePrecision,
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
  },
  (table) => [
    unique("sismos_fuente_external_id_unique").on(
      table.fuente,
      table.externalId,
    ),
  ],
);

export const sismosHistoricos = pgTable("sismos_historicos", {
  id: serial("id").primaryKey(),
  externalId: text("external_id").notNull().unique(),
  fecha: timestamp("fecha").notNull(),
  magnitud: real("magnitud").notNull(),
  profundidadKm: real("profundidad_km").notNull(),
  latitud: doublePrecision("latitud").notNull(),
  longitud: doublePrecision("longitud").notNull(),
  lugar: text("lugar").notNull(),
  bandera: text("bandera"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  magnitudMinima: real("magnitud_minima").notNull().default(4),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
