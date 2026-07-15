import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  crons: [
    {
      path: "/api/ingest",
      // Plan Hobby permite máximo 1x/día de cron nativo de Vercel. La
      // cadencia real (cada 1 min) la da un cron externo (cron-job.org)
      // que pega a /api/ingest con el header x-cron-secret — ver
      // docs/superpowers/specs/2026-07-07-sismos-monorepo-design.md.
      // Este cron diario queda solo como red de seguridad.
      schedule: "0 0 * * *",
    },
  ],
};
