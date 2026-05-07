/**
 * Libera el advisory lock que Prisma toma cuando hace `migrate deploy/resolve`.
 *
 * Cuando un comando previo se cancela mientras tenia el lock (72707369), la
 * sesion en Postgres puede seguir viva hasta que TCP haga timeout (minutos).
 * Este script identifica esos backends y los termina con
 * `pg_terminate_backend` (los usuarios de Neon pueden matar sus propios pids).
 *
 * Uso: npx tsx scripts/free-prisma-migrate-lock.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

interface LockBackend {
  pid: number;
  granted: boolean;
  application_name: string | null;
  query_start: Date | null;
  state: string | null;
}

const PRISMA_MIGRATE_LOCK_ID = 72707369;

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const backends = await prisma.$queryRawUnsafe<LockBackend[]>(
      `select l.pid, l.granted, a.application_name, a.query_start, a.state
       from pg_locks l
       left join pg_stat_activity a on a.pid = l.pid
       where l.locktype = 'advisory' and l.objid = ${PRISMA_MIGRATE_LOCK_ID}`,
    );

    if (backends.length === 0) {
      console.log("[free-lock] No hay backends con el advisory lock de Prisma migrate.");
      return;
    }

    console.log("[free-lock] Backends con el lock:");
    console.log(JSON.stringify(backends, null, 2));

    const me = await prisma.$queryRawUnsafe<Array<{ pid: number }>>(
      "select pg_backend_pid() as pid",
    );
    const myPid = me[0]?.pid;

    for (const b of backends) {
      if (b.pid === myPid) continue;
      try {
        const res = await prisma.$queryRawUnsafe<Array<{ terminated: boolean }>>(
          `select pg_terminate_backend(${b.pid}) as terminated`,
        );
        console.log(`[free-lock] pid=${b.pid} terminated=${res[0]?.terminated ?? "?"}`);
      } catch (err) {
        console.warn(
          `[free-lock] no se pudo terminar pid=${b.pid}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[free-lock] fatal", err);
  process.exit(1);
});
