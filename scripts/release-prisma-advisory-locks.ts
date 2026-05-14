/**
 * Libera los advisory locks que Prisma migrate deja colgados cuando se usa
 * el pooler de Neon o cuando un proceso anterior se interrumpe sin liberar
 * la sesión.
 *
 * Estrategia:
 *  1. Inspecciona pg_locks buscando entradas con locktype = 'advisory'.
 *  2. Termina cada backend (pg_terminate_backend) distinto del actual.
 *  3. Imprime un resumen de lo encontrado y de lo terminado.
 *
 * Uso:
 *   npx tsx scripts/release-prisma-advisory-locks.ts
 *
 * Variables:
 *   DATABASE_URL  Connection string al cluster (idealmente la directa,
 *                 sin -pooler, para garantizar visibilidad de pg_locks).
 */
import { PrismaClient } from "@prisma/client";

type AdvisoryLockRow = {
  pid: number;
  classid: number;
  objid: number;
  granted: boolean;
  application_name: string | null;
  state: string | null;
  query: string | null;
  age_seconds: number | null;
};

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[release-locks] DATABASE_URL no está definido");
    process.exit(1);
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });

  try {
    const locks = await prisma.$queryRawUnsafe<AdvisoryLockRow[]>(`
      SELECT
        l.pid,
        l.classid,
        l.objid,
        l.granted,
        a.application_name,
        a.state,
        a.query,
        EXTRACT(EPOCH FROM (now() - a.state_change))::int AS age_seconds
      FROM pg_locks l
      LEFT JOIN pg_stat_activity a ON a.pid = l.pid
      WHERE l.locktype = 'advisory'
        AND l.pid <> pg_backend_pid()
      ORDER BY age_seconds DESC NULLS LAST
    `);

    if (locks.length === 0) {
      console.log("[release-locks] No hay advisory locks colgados.");
      return;
    }

    console.log(`[release-locks] Encontrados ${locks.length} advisory locks:`);
    for (const lock of locks) {
      console.log(
        `  pid=${lock.pid} classid=${lock.classid} objid=${lock.objid} granted=${lock.granted} app=${lock.application_name ?? "?"} state=${lock.state ?? "?"} age=${lock.age_seconds ?? "?"}s`,
      );
    }

    const uniquePids = Array.from(new Set(locks.map((l) => l.pid)));
    console.log(`[release-locks] Terminando ${uniquePids.length} sesiones...`);

    for (const pid of uniquePids) {
      try {
        const result = await prisma.$queryRawUnsafe<{ pg_terminate_backend: boolean }[]>(
          `SELECT pg_terminate_backend($1::int) AS pg_terminate_backend`,
          pid,
        );
        const ok = result[0]?.pg_terminate_backend === true;
        console.log(`  pid=${pid} -> terminated=${ok}`);
      } catch (err) {
        console.error(`  pid=${pid} -> error:`, err instanceof Error ? err.message : err);
      }
    }

    const remaining = await prisma.$queryRawUnsafe<AdvisoryLockRow[]>(`
      SELECT l.pid, l.classid, l.objid, l.granted, NULL::text AS application_name, NULL::text AS state, NULL::text AS query, NULL::int AS age_seconds
      FROM pg_locks l
      WHERE l.locktype = 'advisory' AND l.pid <> pg_backend_pid()
    `);
    console.log(`[release-locks] Locks restantes: ${remaining.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[release-locks] Error:", err);
  process.exit(1);
});
