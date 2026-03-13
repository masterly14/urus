/**
 * Sincroniza enums/catálogos de Inmovilla desde la API REST a Neon.
 * Rate limit: 2 peticiones/minuto (espera 30s entre cada llamada).
 *
 * Requiere: INMOVILLA_API_TOKEN, DATABASE_URL en .env
 *
 * Ejecutar: npx tsx scripts/sync-inmovilla-enums.ts
 *
 * Opciones:
 *   --skip-zonas   No descarga zonas (menos llamadas; zonas se pueden sincronizar después).
 */

import "dotenv/config";
import { createInmovillaRestClient } from "@/lib/inmovilla/rest";
import { syncEnums } from "@/lib/inmovilla/rest/sync-enums";
import { prisma } from "@/lib/prisma";

async function main() {
  const token = process.env.INMOVILLA_API_TOKEN;
  if (!token) {
    console.error("Configura INMOVILLA_API_TOKEN en .env");
    process.exit(1);
  }

  const skipZonas = process.argv.includes("--skip-zonas");
  const client = createInmovillaRestClient({ token });

  console.log("Sincronizando enums Inmovilla -> Neon (throttle 2/min)...");
  if (skipZonas) console.log("  (zonas omitidas por --skip-zonas)");

  await syncEnums(client, prisma, { skipZonas });

  console.log("Sincronización completada.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
