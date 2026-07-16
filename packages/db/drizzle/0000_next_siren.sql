CREATE TABLE "sismos" (
	"id" serial PRIMARY KEY NOT NULL,
	"fuente" text NOT NULL,
	"external_id" text NOT NULL,
	"fecha" timestamp NOT NULL,
	"magnitud" real NOT NULL,
	"profundidad_km" real NOT NULL,
	"latitud" double precision NOT NULL,
	"longitud" double precision NOT NULL,
	"lugar" text NOT NULL,
	"bandera" text,
	"ref_cruzada_fuente" text,
	"ref_cruzada_external_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sismos_fuente_external_id_unique" UNIQUE("fuente","external_id")
);
--> statement-breakpoint
CREATE TABLE "sismos_historicos" (
	"id" serial PRIMARY KEY NOT NULL,
	"external_id" text NOT NULL,
	"fecha" timestamp NOT NULL,
	"magnitud" real NOT NULL,
	"profundidad_km" real NOT NULL,
	"latitud" double precision NOT NULL,
	"longitud" double precision NOT NULL,
	"lugar" text NOT NULL,
	"bandera" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sismos_historicos_external_id_unique" UNIQUE("external_id")
);
