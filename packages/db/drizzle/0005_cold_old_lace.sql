CREATE TABLE "estado_ingesta" (
	"fuente" text PRIMARY KEY NOT NULL,
	"ultima_alerta_enviada" timestamp
);
--> statement-breakpoint
ALTER TABLE "sismos" ADD COLUMN "ubicacion_aproximada" boolean DEFAULT false NOT NULL;