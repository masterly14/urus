import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { matchDemandsToPropertyById } from "@/lib/matching";

const MAX_MATCH_EVENTS_PER_PROPERTY = 20;

type CliOptions = {
  limit: number;
  days: number;
  propertyCode: string | null;
  includeUnavailable: boolean;
};

type MissingMatch = {
  propertyId: string;
  propertyRef: string;
  demandId: string;
  demandRef: string;
  score: number;
  aggregateId: string;
};

function parseArgs(argv: string[]): CliOptions {
  let limit = 50;
  let days = 30;
  let propertyCode: string | null = null;
  let includeUnavailable = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--limit") {
      const v = Number(argv[i + 1]);
      if (Number.isFinite(v) && v > 0) {
        limit = Math.floor(v);
        i++;
      }
      continue;
    }

    if (arg === "--days") {
      const v = Number(argv[i + 1]);
      if (Number.isFinite(v) && v >= 0) {
        days = Math.floor(v);
        i++;
      }
      continue;
    }

    if (arg === "--property") {
      const v = argv[i + 1];
      if (v && !v.startsWith("--")) {
        propertyCode = v;
        i++;
      }
      continue;
    }

    if (arg === "--include-unavailable") {
      includeUnavailable = true;
      continue;
    }
  }

  return { limit, days, propertyCode, includeUnavailable };
}

function cutoffDate(days: number): Date {
  if (days <= 0) return new Date(0);
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function getTargetProperties(opts: CliOptions): Promise<Array<{ codigo: string; ref: string }>> {
  if (opts.propertyCode) {
    const one = await prisma.propertyCurrent.findUnique({
      where: { codigo: opts.propertyCode },
      select: { codigo: true, ref: true },
    });
    return one ? [one] : [];
  }

  return prisma.propertyCurrent.findMany({
    where: {
      updatedAt: { gte: cutoffDate(opts.days) },
      ...(opts.includeUnavailable
        ? {}
        : {
            nodisponible: false,
            prospecto: false,
          }),
    },
    orderBy: { updatedAt: "desc" },
    take: opts.limit,
    select: { codigo: true, ref: true },
  });
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  const properties = await getTargetProperties(opts);
  if (properties.length === 0) {
    console.log("No hay propiedades objetivo para validar con los filtros actuales.");
    return;
  }

  const expected: MissingMatch[] = [];
  let propertiesWithExpectedMatches = 0;

  for (const property of properties) {
    const result = await matchDemandsToPropertyById(property.codigo);
    if (!result || result.matches.length === 0) continue;

    propertiesWithExpectedMatches++;
    const topMatches = result.matches.slice(0, MAX_MATCH_EVENTS_PER_PROPERTY);
    for (const m of topMatches) {
      expected.push({
        propertyId: m.propertyId,
        propertyRef: m.propertyRef,
        demandId: m.demandId,
        demandRef: m.demandRef,
        score: m.totalScore,
        aggregateId: `${m.demandId}:${m.propertyId}`,
      });
    }
  }

  if (expected.length === 0) {
    console.log("No hay matches esperados en el conjunto analizado.");
    return;
  }

  const aggregateIds = [...new Set(expected.map((m) => m.aggregateId))];
  const existing = await prisma.event.findMany({
    where: {
      type: "MATCH_GENERADO",
      aggregateType: "MATCH",
      aggregateId: { in: aggregateIds },
    },
    select: { aggregateId: true },
  });
  const existingIds = new Set(existing.map((e) => e.aggregateId));

  const missing = expected.filter((m) => !existingIds.has(m.aggregateId));
  const uniqueMissingPairs = [...new Set(missing.map((m) => m.aggregateId))];

  console.log("=== Validación de cruces no emitidos (MATCH_GENERADO) ===");
  console.log(
    JSON.stringify(
      {
        filters: {
          property: opts.propertyCode,
          days: opts.days,
          limit: opts.limit,
          includeUnavailable: opts.includeUnavailable,
        },
        scannedProperties: properties.length,
        propertiesWithExpectedMatches,
        expectedMatchPairsTop20: aggregateIds.length,
        existingMatchEvents: existingIds.size,
        missingMatchPairs: uniqueMissingPairs.length,
      },
      null,
      2,
    ),
  );

  if (missing.length === 0) {
    console.log("OK: no se detectaron cruces faltantes para el alcance validado.");
    return;
  }

  const topMissing = missing
    .sort((a, b) => b.score - a.score)
    .slice(0, 50)
    .map((m) => ({
      aggregateId: m.aggregateId,
      propertyId: m.propertyId,
      propertyRef: m.propertyRef,
      demandId: m.demandId,
      demandRef: m.demandRef,
      score: m.score,
    }));

  console.log("\nTop cruces faltantes (máx 50, por score desc):");
  console.log(JSON.stringify(topMissing, null, 2));
}

main()
  .catch((err) => {
    console.error("Fallo validando cruces faltantes:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
