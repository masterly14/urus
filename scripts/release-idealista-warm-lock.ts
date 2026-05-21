import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const key = "portal-warm-session:idealista";
  console.log(`[release-lock] key=${key}`);

  // Si podemos adquirirlo, entonces NO estaba bloqueado por otro backend.
  // Lo desbloqueamos inmediatamente para no dejar lock de sesión.
  const acquiredRows = await prisma.$queryRaw<Array<{ acquired: boolean }>>`
    SELECT pg_try_advisory_lock(hashtext(${key})) AS acquired
  `;
  const acquired = acquiredRows[0]?.acquired ?? false;

  if (acquired) {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(hashtext(${key}))`;
    console.log(
      "[release-lock] OK: lock libre (o lo adquirimos y liberamos inmediatamente).",
    );
    return;
  }

  console.warn(
    "[release-lock] Lock ocupado por otro backend. Intento liberar backend bloqueante...",
  );

  // Para lock bigint con hashtext(), objid contiene el hash int32.
  const terminated = await prisma.$queryRaw<Array<{ pid: number; terminated: boolean }>>`
    WITH target AS (
      SELECT a.pid
      FROM pg_locks l
      JOIN pg_stat_activity a ON a.pid = l.pid
      WHERE l.locktype = 'advisory'
        AND l.granted = true
        AND l.objid = hashtext(${key})
        AND a.pid <> pg_backend_pid()
    )
    SELECT pid, pg_terminate_backend(pid) AS terminated
    FROM target
  `;

  if (terminated.length === 0) {
    console.log(
      "[release-lock] No encontré backend específico para ese key. Puede ser lock no detectable por objid o condición transitoria.",
    );
  } else {
    for (const row of terminated) {
      console.log(
        `[release-lock] backend pid=${row.pid} terminated=${row.terminated}`,
      );
    }
  }

  const reacquiredRows = await prisma.$queryRaw<Array<{ acquired: boolean }>>`
    SELECT pg_try_advisory_lock(hashtext(${key})) AS acquired
  `;
  const reacquired = reacquiredRows[0]?.acquired ?? false;
  if (reacquired) {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(hashtext(${key}))`;
    console.log("[release-lock] OK: lock liberado.");
  } else {
    console.warn(
      "[release-lock] Sigue ocupado tras intento. Recomiendo reiniciar market-worker para cerrar conexiones y liberar transacciones colgadas.",
    );
  }
}

main()
  .catch((err) => {
    console.error("[release-lock] fatal:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

