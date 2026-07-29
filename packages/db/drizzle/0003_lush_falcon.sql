ALTER TABLE "sismos_historicos" DROP CONSTRAINT "sismos_historicos_external_id_unique";--> statement-breakpoint
ALTER TABLE "sismos_historicos" ADD COLUMN "alcance" text DEFAULT 'mundial' NOT NULL;--> statement-breakpoint
ALTER TABLE "sismos_historicos" ADD CONSTRAINT "sismos_historicos_external_id_alcance_unique" UNIQUE("external_id","alcance");