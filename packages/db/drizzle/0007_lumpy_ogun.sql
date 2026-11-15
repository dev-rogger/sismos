ALTER TABLE "sismos" ADD COLUMN "notificado_at" timestamp;--> statement-breakpoint
ALTER TABLE "sismos" ADD COLUMN "magnitud_notificada" double precision;--> statement-breakpoint
-- Backfill: lo que ya existe se considera avisado, para evitar un re-aviso masivo
-- en la primera corrida del ingestor tras desplegar.
UPDATE "sismos" SET "notificado_at" = "updated_at", "magnitud_notificada" = "magnitud" WHERE "magnitud" >= 4;
