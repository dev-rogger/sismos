import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  crons: [
    {
      path: "/api/ingest",
      // Vercel Cron: mínimo 1x/minuto, y en plan Hobby (gratis) máximo
      // 1x/día. La cadencia real de 30-60s pedida en el spec no es
      // alcanzable así en el plan gratuito — ver spec, "Riesgos conocidos".
      schedule: "*/1 * * * *",
    },
  ],
};
