-- H27: secuencia atómica por año para generar Operacion.codigo sin race conditions.
-- Reemplaza el patrón read-then-increment (SELECT MAX(codigo) + 1) por un
-- INSERT ... ON CONFLICT DO UPDATE ... RETURNING lastValue atómico.

CREATE TABLE "operacion_sequences" (
    "year" INTEGER NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operacion_sequences_pkey" PRIMARY KEY ("year")
);

-- Backfill: inicializar `lastValue` por año a partir del máximo sufijo
-- numérico ya presente en `operaciones.codigo` (formato OP-YYYY-NNNN).
-- Esto evita que la primera llamada post-migración colisione con códigos
-- ya existentes.
INSERT INTO "operacion_sequences" ("year", "lastValue", "updatedAt")
SELECT
    CAST(SUBSTRING("codigo" FROM 4 FOR 4) AS INTEGER) AS "year",
    MAX(CAST(SUBSTRING("codigo" FROM 9) AS INTEGER)) AS "lastValue",
    NOW() AS "updatedAt"
FROM "operaciones"
WHERE "codigo" ~ '^OP-[0-9]{4}-[0-9]+$'
GROUP BY CAST(SUBSTRING("codigo" FROM 4 FOR 4) AS INTEGER)
ON CONFLICT ("year") DO NOTHING;
