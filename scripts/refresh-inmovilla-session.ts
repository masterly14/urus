/**
 * Refresca la sesión de Inmovilla CRM v2 y la guarda en Neon.
 *
 * Este script es el "session proxy": se ejecuta en un entorno con
 * Playwright + Chromium disponible (local, Railway, Render, GitHub Actions)
 * y persiste la sesión en la tabla inmovilla_session_store para que los
 * workers serverless de Vercel puedan leerla sin necesidad de Playwright.
 *
 * Uso:
 *   npx tsx scripts/refresh-inmovilla-session.ts
 *
 * Cron recomendado: cada 4-6 horas (las sesiones duran ~8h).
 */

import "dotenv/config";
import { loginToInmovilla } from "@/lib/inmovilla/auth/login";
import { saveSessionToDb, loadSessionFromDb } from "@/lib/inmovilla/auth/session-store";
import { PrismaClient } from "@/app/generated/prisma/client";

const prisma = new PrismaClient();

const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS ?? "6");

async function main() {
  console.log("[refresh-session] Verificando sesión actual en DB...");

  const existing = await loadSessionFromDb();
  if (existing) {
    const row = await prisma.inmovillaSessionStore.findUnique({
      where: { id: "singleton" },
      select: { expiresAt: true, updatedAt: true },
    });
    if (row) {
      const remainingMs = row.expiresAt.getTime() - Date.now();
      const remainingMin = Math.round(remainingMs / 60_000);
      if (remainingMin > 60) {
        console.log(
          `[refresh-session] Sesión válida (expira en ${remainingMin} min). ` +
            `Usa --force para renovar de todas formas.`,
        );
        if (!process.argv.includes("--force")) {
          await prisma.$disconnect();
          return;
        }
        console.log("[refresh-session] --force: renovando de todas formas");
      } else {
        console.log(
          `[refresh-session] Sesión próxima a expirar (${remainingMin} min restantes) — renovando`,
        );
      }
    }
  } else {
    console.log("[refresh-session] Sin sesión en DB — creando nueva");
  }

  console.log("[refresh-session] Ejecutando login con Playwright...");
  const session = await loginToInmovilla({
    headless: true,
    persistSession: true,
  });

  await saveSessionToDb(session, "refresh-script", SESSION_TTL_HOURS);
  console.log("[refresh-session] Sesión guardada en Neon con éxito");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[refresh-session] Error fatal:", err);
  process.exit(1);
});
