ALTER TABLE "sismos" ADD COLUMN "fuente_notificada" text;
--> statement-breakpoint
-- Backfill: lo ya avisado se avisó con la fuente que tiene hoy la fila.
UPDATE "sismos" SET "fuente_notificada" = "fuente" WHERE "notificado_at" IS NOT NULL;
