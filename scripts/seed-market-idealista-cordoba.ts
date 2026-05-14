/**
 * Sembrado idempotente de seeds Market para Idealista — Cordoba capital
 * (Fase 2.c, decisiones.md §11.2).
 *
 * Crea 3 `MarketSeed` activos con cadencia 120 min y prioridad 30 (menor
 * que Fotocasa/Pisos.com=100 para no saturar Web Unlocker), e inicializa
 * el `MarketCircuitBreaker` para `source_d` en CLOSED.
 *
 * Uso:
 *   npx tsx scripts/seed-market-idealista-cordoba.ts
 *   npx tsx scripts/seed-market-idealista-cordoba.ts --dry-run
 *   npx tsx scripts/seed-market-idealista-cordoba.ts --deactivate
 *
 * Importante: este script NO activa Idealista en producción. La activacion
 * la hace `MARKET_IDEALISTA_ENABLED=true` en Vercel + Railway.
 *
 * Idempotente por unique `(source, operation, city, zone, url)`.
 */

import { PrismaClient, type MarketOperation, type MarketSource } from "@prisma/client";

interface SeedDefinition {
  source: MarketSource;
  operation: MarketOperation;
  city: string;
  zone: string | null;
  url: string;
  priority: number;
  cadenceMinutes: number;
  notes: string;
}

// 3 seeds confirmados en decisiones.md §11.2 + verificados con captura real
// el 06/05/2026 (~370 KB cada uno via Web Unlocker, ~30 cards/pagina).
const SEEDS: SeedDefinition[] = [
  {
    source: "source_d",
    operation: "sale",
    city: "cordoba",
    zone: null,
    url: "https://www.idealista.com/venta-viviendas/cordoba-cordoba/",
    priority: 30,
    cadenceMinutes: 120,
    notes: "Idealista - todas las tipologias en venta, Cordoba capital. Captura ~30 cards/pag.",
  },
  {
    source: "source_d",
    operation: "sale",
    city: "cordoba",
    zone: null,
    url: "https://www.idealista.com/venta-viviendas/cordoba-cordoba/con-pisos/",
    priority: 30,
    cadenceMinutes: 120,
    notes: "Idealista - filtro pisos en venta, Cordoba capital. Captura ~30 cards/pag.",
  },
  {
    source: "source_d",
    operation: "sale",
    city: "cordoba",
    zone: null,
    url: "https://www.idealista.com/venta-viviendas/cordoba-cordoba/con-precio-hasta_300000/",
    priority: 30,
    cadenceMinutes: 120,
    notes: "Idealista - filtro precio <= 300k, Cordoba capital. Captura ~30 cards/pag.",
  },
];

interface ScriptOptions {
  dryRun: boolean;
  deactivate: boolean;
}

function parseArgs(argv: string[]): ScriptOptions {
  return {
    dryRun: argv.includes("--dry-run"),
    deactivate: argv.includes("--deactivate"),
  };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    console.log(
      `[seed-idealista] modo=${opts.dryRun ? "DRY-RUN" : opts.deactivate ? "DEACTIVATE" : "UPSERT"}`,
    );

    if (opts.deactivate) {
      const updated = opts.dryRun
        ? { count: SEEDS.length }
        : await prisma.marketSeed.updateMany({
            where: {
              OR: SEEDS.map((s) => ({
                source: s.source,
                operation: s.operation,
                city: s.city,
                zone: s.zone,
                url: s.url,
              })),
            },
            data: { active: false },
          });
      console.log(`[seed-idealista] desactivados=${updated.count} seeds`);
      return;
    }

    let created = 0;
    let updated = 0;
    for (const seed of SEEDS) {
      if (opts.dryRun) {
        console.log(
          `[seed-idealista] DRY-RUN upsert source=${seed.source} url=${seed.url}`,
        );
        continue;
      }
      const existing = await prisma.marketSeed.findUnique({
        where: {
          source_operation_city_zone_url: {
            source: seed.source,
            operation: seed.operation,
            city: seed.city,
            zone: seed.zone ?? "",
            url: seed.url,
          },
        },
        select: { id: true },
      });

      if (existing) {
        await prisma.marketSeed.update({
          where: { id: existing.id },
          data: {
            active: true,
            priority: seed.priority,
            cadenceMinutes: seed.cadenceMinutes,
            notes: seed.notes,
          },
        });
        updated++;
        console.log(`[seed-idealista] UPDATED ${seed.url}`);
      } else {
        await prisma.marketSeed.create({
          data: {
            source: seed.source,
            operation: seed.operation,
            city: seed.city,
            zone: seed.zone,
            url: seed.url,
            active: true,
            priority: seed.priority,
            cadenceMinutes: seed.cadenceMinutes,
            notes: seed.notes,
          },
        });
        created++;
        console.log(`[seed-idealista] CREATED ${seed.url}`);
      }
    }

    if (!opts.dryRun) {
      await prisma.marketCircuitBreaker.upsert({
        where: { source: "source_d" },
        create: {
          source: "source_d",
          status: "CLOSED",
          failureCount: 0,
        },
        update: {},
      });
      console.log(`[seed-idealista] circuit breaker asegurado (CLOSED) para source_d`);
    }

    console.log(
      `[seed-idealista] resumen: created=${created} updated=${updated} total=${SEEDS.length}`,
    );
    console.log("");
    console.log("[seed-idealista] Recuerda:");
    console.log("  - Estos seeds NO se ejecutaran hasta que MARKET_IDEALISTA_ENABLED=true.");
    console.log("  - El extractor source_d solo se registra en el Worker si las BRIGHTDATA_*");
    console.log("    estan presentes (BRIGHTDATA_API_TOKEN, BRIGHTDATA_WEB_UNLOCKER_ZONE,");
    console.log("    BRIGHTDATA_SCRAPING_BROWSER_URL, BRIGHTDATA_RESIDENTIAL_PROXY_URL).");
    console.log("  - Para desactivar: npx tsx scripts/seed-market-idealista-cordoba.ts --deactivate");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[seed-idealista] fallo fatal:", err);
  process.exit(1);
});
