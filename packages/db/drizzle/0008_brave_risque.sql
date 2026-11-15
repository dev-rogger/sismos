CREATE TABLE "ingesta_estado" (
	"fuente" text PRIMARY KEY NOT NULL,
	"ultimo_ok" timestamp with time zone,
	"ultimo_error" timestamp with time zone,
	"ultimo_error_msg" text
);
