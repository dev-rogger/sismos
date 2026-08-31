---
tags: [idea, admin, diferido]
---

# Idea diferida: panel de salud en `/admin`

## Aclaración importante

La memoria de sesiones anteriores tenía una idea de "panel de salud en `/admin` mostrando estado de Supabase/cron" — pero **sismos no usa Supabase** (usa PostgreSQL + Drizzle ORM en un proveedor propio, ver [[../02 - Base de Datos]]). Esa mención a Supabase viene casi seguro de un cruce con otro proyecto del workspace (`experto-muebles`, que sí usa Supabase). Esta nota adapta la idea a lo que sismos realmente tiene.

## La idea adaptada a sismos

Mostrar en `/admin` (ya existe la sección, con `apps/web/app/admin/reportes/page.tsx` hoy en estado "Próximamente" — ver [[../03 - API Reference]]) el estado de salud real del sistema:

- Última corrida exitosa del ingestor (`GET /api/ingest`) — hoy no se persiste explícitamente un "último éxito", solo `estadoIngesta.ultimaAlertaEnviada` (que es sobre alertas enviadas, no sobre cada corrida de ingesta). Habría que agregar una columna/tabla si se quiere trackear "última ingesta exitosa" por fuente, distinta de "última alerta enviada".
- Estado de las 3 fuentes externas (CSN, GAEL fallback, USGS) — si la última corrida tuvo error en alguna.
- Conexión a Postgres (ping simple).
- Conteo de suscripciones push activas.

## Estado

Diferido explícitamente — no implementar sin que el usuario lo pida. Dejar constancia acá para no perder la idea entre sesiones.
