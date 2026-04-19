/**
 * Bootstrap post-deploy idempotente para Vercel.
 *
 * Ejecuta tareas de sincronización inicial de forma segura y repetible.
 * Cada paso tiene guardas de idempotencia — re-ejecutar no duplica datos.
 *
 * Control por variables de entorno:
 *   BOOTSTRAP_ON_DEPLOY=true    — activa la ejecución (omitir = no-op)
 *   BOOTSTRAP_MODE=safe|full    — safe (default): solo seed CEO + schema check
 *                                  full: seed + sync catálogos + backfills
 *
 * Ejecución manual: npx tsx scripts/post-deploy-bootstrap.ts
 * En Vercel: como postbuild command o invocado via API route protegida.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ENABLED = ["true", "1", "yes"].includes(
  (process.env.BOOTSTRAP_ON_DEPLOY ?? "").toLowerCase()
);
const MODE = (process.env.BOOTSTRAP_MODE ?? "safe").toLowerCase();

async function seedCeo(): Promise<void> {
  const email = process.env.CEO_SEED_EMAIL;
  const password = process.env.CEO_SEED_PASSWORD;

  if (!email || !password) {
    console.log("[bootstrap] CEO_SEED_EMAIL/PASSWORD no configurados — skip seed CEO");
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    if (existing.role !== "ceo") {
      await prisma.user.update({
        where: { id: existing.id },
        data: { role: "ceo" },
      });
      console.log(`[bootstrap] Usuario ${email} actualizado a rol CEO`);
    } else {
      console.log(`[bootstrap] CEO ya existe: ${email}`);
    }
    return;
  }

  const { auth } = await import("@/lib/auth");
  const result = await auth.api.signUpEmail({
    body: { email, password, name: "CEO" },
  });

  if (!result?.user) {
    console.error("[bootstrap] Error creando usuario CEO");
    return;
  }

  await prisma.user.update({
    where: { id: result.user.id },
    data: { role: "ceo", emailVerified: true },
  });

  console.log(`[bootstrap] CEO creado: ${email} (id: ${result.user.id})`);
}

async function verifyDbConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const dbUrl = process.env.DATABASE_URL ?? "";
    const host = dbUrl.match(/@([^/]+)/)?.[1] ?? "unknown";
    console.log(`[bootstrap] DB conectada: ${host}`);
    return true;
  } catch (err) {
    console.error("[bootstrap] No se pudo conectar a la base de datos:", err);
    return false;
  }
}

async function runSyncCatalogs(): Promise<void> {
  if (MODE !== "full") {
    console.log("[bootstrap] Modo safe — skip sync catálogos");
    return;
  }

  if (!process.env.INMOVILLA_API_TOKEN) {
    console.log("[bootstrap] INMOVILLA_API_TOKEN no configurado — skip sync catálogos");
    return;
  }

  console.log("[bootstrap] Sync catálogos Inmovilla (idempotente)...");
  const { execSync } = await import("child_process");
  try {
    execSync("npx tsx scripts/sync-inmovilla-enums.ts --skip-zonas", {
      stdio: "inherit",
      timeout: 120_000,
    });
    console.log("[bootstrap] Sync catálogos completado");
  } catch (err) {
    console.error("[bootstrap] Error sync catálogos (no fatal):", err);
  }
}

async function runBackfillOperaciones(): Promise<void> {
  if (MODE !== "full") {
    console.log("[bootstrap] Modo safe — skip backfill operaciones");
    return;
  }

  console.log("[bootstrap] Backfill operaciones (idempotente)...");
  const { execSync } = await import("child_process");
  try {
    execSync("npx tsx scripts/backfill-operaciones.ts", {
      stdio: "inherit",
      timeout: 120_000,
    });
    console.log("[bootstrap] Backfill operaciones completado");
  } catch (err) {
    console.error("[bootstrap] Error backfill operaciones (no fatal):", err);
  }
}

async function main(): Promise<void> {
  console.log(`[bootstrap] BOOTSTRAP_ON_DEPLOY=${ENABLED}, MODE=${MODE}`);

  if (!ENABLED) {
    console.log("[bootstrap] Desactivado. Set BOOTSTRAP_ON_DEPLOY=true para ejecutar.");
    return;
  }

  const dbOk = await verifyDbConnection();
  if (!dbOk) {
    console.error("[bootstrap] Abortando — sin conexión a DB");
    process.exit(1);
  }

  await seedCeo();
  await runSyncCatalogs();
  await runBackfillOperaciones();

  console.log("[bootstrap] Completado.");
}

main()
  .catch((err) => {
    console.error("[bootstrap] Error fatal:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
