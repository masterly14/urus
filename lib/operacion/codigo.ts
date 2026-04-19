import { prisma } from "@/lib/prisma";

/**
 * Genera el próximo código de operación con formato OP-{YYYY}-{NNNN}.
 *
 * H27: se reemplaza el viejo patrón `SELECT MAX(codigo) + 1` (que generaba
 * duplicados bajo concurrencia) por un upsert atómico contra la tabla
 * `operacion_sequences`. Postgres garantiza que `INSERT ... ON CONFLICT DO
 * UPDATE SET lastValue = lastValue + 1 RETURNING lastValue` sea atómico:
 * dos requests concurrentes siempre obtienen valores distintos.
 *
 * Ejemplo: OP-2026-0001, OP-2026-0002, …, OP-2026-9999.
 */
export async function generarCodigoOperacion(): Promise<string> {
  const year = new Date().getFullYear();

  const rows = await prisma.$queryRaw<Array<{ lastValue: number }>>`
    INSERT INTO "operacion_sequences" ("year", "lastValue", "updatedAt")
    VALUES (${year}, 1, NOW())
    ON CONFLICT ("year")
    DO UPDATE SET "lastValue" = "operacion_sequences"."lastValue" + 1,
                  "updatedAt" = NOW()
    RETURNING "lastValue"
  `;

  const seq = rows[0]?.lastValue ?? 1;
  return `OP-${year}-${String(seq).padStart(4, "0")}`;
}
