/**
 * Script de prueba end-to-end del worker de extrainfo.
 *
 * Ejecuta `runExtrainfoIngestionCycle()` contra la API REST real de Inmovilla
 * y muestra el resultado del ciclo (nº de propiedades procesadas, con/sin
 * portal, fallidas, duración, etc.).
 *
 * Uso:
 *   npx tsx scripts/test-ingesta-extrainfo.ts
 *
 * Requiere en `.env`:
 *   - INMOVILLA_API_TOKEN
 *   - DATABASE_URL (para leer properties_current y guardar portalUrl)
 *
 * IMPORTANTE: este script consume cuota real del rate limit de Inmovilla
 * (~5 req/min para /propiedades/). Hasta 20 propiedades por run → ~4 minutos.
 */

import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { runExtrainfoIngestionCycle } from "@/lib/workers/ingestion/extrainfo-worker";

async function main(): Promise<void> {
  console.log("🚀 Iniciando ciclo extrainfo...\n");

  const before = await prisma.propertyCurrent.findMany({
    where: { nodisponible: false, prospecto: false },
    select: {
      codigo: true,
      portalUrl: true,
      portalName: true,
      portalSyncedAt: true,
    },
  });
  const beforeWithPortal = before.filter((p) => p.portalUrl).length;
  const beforeNeverSynced = before.filter((p) => !p.portalSyncedAt).length;

  console.log(`Estado inicial:`);
  console.log(`  · Propiedades activas: ${before.length}`);
  console.log(`  · Con portalUrl: ${beforeWithPortal}`);
  console.log(`  · Nunca sincronizadas: ${beforeNeverSynced}\n`);

  const result = await runExtrainfoIngestionCycle();

  console.log("\n📊 Resultado del ciclo:");
  console.log(JSON.stringify(result, null, 2));

  const after = await prisma.propertyCurrent.findMany({
    where: { nodisponible: false, prospecto: false },
    select: {
      codigo: true,
      ref: true,
      portalUrl: true,
      portalName: true,
    },
  });
  const afterWithPortal = after.filter((p) => p.portalUrl).length;

  console.log(`\nEstado final:`);
  console.log(`  · Con portalUrl: ${afterWithPortal} (antes: ${beforeWithPortal})`);
  console.log(`  · Delta: +${afterWithPortal - beforeWithPortal}`);

  const samplesWithPortal = after
    .filter((p) => p.portalUrl)
    .slice(0, 5);
  if (samplesWithPortal.length > 0) {
    console.log(`\n🔗 Ejemplos de portalUrl sincronizados:`);
    for (const p of samplesWithPortal) {
      console.log(`  · [${p.codigo}] ${p.ref} → ${p.portalName}: ${p.portalUrl}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("❌", err instanceof Error ? err.message : err);
  await prisma.$disconnect();
  process.exit(1);
});
