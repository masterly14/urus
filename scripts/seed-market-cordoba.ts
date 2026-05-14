/**
 * Sembrado idempotente de seeds Market para Cordoba capital.
 *
 * Crea (o actualiza) las URLs de Fotocasa y Pisos.com como `MarketSeed`
 * activos con cadencia 120 min, e inicializa los `MarketCircuitBreaker`
 * en CLOSED para los sources activos.
 *
 * Uso:
 *   npx tsx scripts/seed-market-cordoba.ts
 *   npx tsx scripts/seed-market-cordoba.ts --dry-run     # no escribe
 *   npx tsx scripts/seed-market-cordoba.ts --deactivate  # marca todos como inactive
 *
 * Idempotente: re-ejecutarlo no duplica filas, gracias a los uniques de
 * `MarketSeed(source, operation, city, zone, url)` y `MarketCircuitBreaker(source)`.
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

const SEEDS: SeedDefinition[] = [
  // Fotocasa: pag. 1 sirve 25 cards tras scrollToBottom; pag. 2+ requiere
  // Web Unlocker (post-MVP). Un solo seed cubre Cordoba capital.
  {
    source: "source_a",
    operation: "sale",
    city: "cordoba",
    zone: null,
    url: "https://www.fotocasa.es/es/comprar/viviendas/cordoba-capital/todas-las-zonas/l",
    priority: 100,
    cadenceMinutes: 120,
    notes: "Fotocasa - todas las viviendas en venta, Cordoba capital",
  },
  // Pisos.com: paginacion sin bloqueos hasta pag. 3 confirmada. 3 seeds para
  // cubrir distintas tipologias dentro del MVP (residencial + garajes + locales).
  {
    source: "source_b",
    operation: "sale",
    city: "cordoba",
    zone: null,
    url: "https://www.pisos.com/venta/pisos-cordoba_capital/",
    priority: 100,
    cadenceMinutes: 120,
    notes: "Pisos.com - pisos en venta, Cordoba capital",
  },
  {
    source: "source_b",
    operation: "sale",
    city: "cordoba",
    zone: null,
    url: "https://www.pisos.com/venta/casas-cordoba_capital/",
    priority: 90,
    cadenceMinutes: 120,
    notes: "Pisos.com - casas/chalets en venta, Cordoba capital",
  },
  {
    source: "source_b",
    operation: "sale",
    city: "cordoba",
    zone: null,
    url: "https://www.pisos.com/venta/garajes-cordoba_capital/",
    priority: 70,
    cadenceMinutes: 240,
    notes: "Pisos.com - garajes en venta, Cordoba capital (cadencia mas relajada)",
  },
];

const ACTIVE_SOURCES: readonly MarketSource[] = ["source_a", "source_b"];

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
      `[seed-market] modo=${opts.dryRun ? "DRY-RUN" : opts.deactivate ? "DEACTIVATE" : "UPSERT"}`,
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
      console.log(`[seed-market] desactivados=${updated.count} seeds`);
      return;
    }

    let created = 0;
    let updated = 0;
    for (const seed of SEEDS) {
      if (opts.dryRun) {
        console.log(
          `[seed-market] DRY-RUN upsert source=${seed.source} url=${seed.url}`,
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
        console.log(`[seed-market] UPDATED ${seed.source} ${seed.url}`);
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
        console.log(`[seed-market] CREATED ${seed.source} ${seed.url}`);
      }
    }

    if (!opts.dryRun) {
      for (const source of ACTIVE_SOURCES) {
        await prisma.marketCircuitBreaker.upsert({
          where: { source },
          create: {
            source,
            status: "CLOSED",
            failureCount: 0,
          },
          update: {},
        });
      }
      console.log(
        `[seed-market] circuit breakers asegurados (CLOSED) para ${ACTIVE_SOURCES.join(", ")}`,
      );
    }

    console.log(
      `[seed-market] resumen: created=${created} updated=${updated} total=${SEEDS.length}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[seed-market] fallo fatal:", err);
  process.exit(1);
});
