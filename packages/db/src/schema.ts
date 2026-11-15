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
import crypto from "node:crypto";

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
    ubicacionAproximada: boolean("ubicacion_aproximada")
      .notNull()
      .default(false),
    // Estado de notificación push: cuándo se avisó y con qué magnitud. Lo
    // escribe solo marcarNotificado(); ningún upsert/replace lo pisa.
    notificadoAt: timestamp("notificado_at"),
    magnitudNotificada: doublePrecision("magnitud_notificada"),
    // Fuente con la que se avisó (puede ser distinta de `fuente` si CSN
    // reemplazó una fila de USGS ya avisada).
    fuenteNotificada: text("fuente_notificada"),
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

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  passwordHash: text("password_hash"),
  role: text("role").notNull().default("user"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

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
  userId: text("user_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const estadoIngesta = pgTable("estado_ingesta", {
  fuente: text("fuente").primaryKey(),
  ultimaAlertaEnviada: timestamp("ultima_alerta_enviada"),
});

// Salud de la ingesta por fuente ("csn" | "usgs" | "gael" | "push"). Distinta de
// `estado_ingesta`, que solo guarda el throttle de alertas al admin.
export const ingestaEstado = pgTable("ingesta_estado", {
  fuente: text("fuente").primaryKey(),
  ultimoOk: timestamp("ultimo_ok", { withTimezone: true }),
  ultimoError: timestamp("ultimo_error", { withTimezone: true }),
  ultimoErrorMsg: text("ultimo_error_msg"),
});
