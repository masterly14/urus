import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { isClosedOperation } from "@/lib/post-sale/closed-operation";
import { upsertCommercialOperationFactFromOperacionCerradaEvent } from "@/lib/dashboard/comercial/facts";
import type { EventRecord } from "@/lib/event-store/types";

interface CliOptions {
  apply: boolean;
  refreshExisting: boolean;
  from?: Date;
  to?: Date;
  limit: number;
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function parseArgs(argv: string[]): CliOptions {
  let apply = false;
  let refreshExisting = false;
  let from: Date | undefined;
  let to: Date | undefined;
  let limit = 1000;

  for (const arg of argv) {
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--refresh-existing") {
      refreshExisting = true;
      continue;
    }

    if (arg.startsWith("--from=")) {
      from = parseDate(arg.slice("--from=".length));
      continue;
    }

    if (arg.startsWith("--to=")) {
      to = parseDate(arg.slice("--to=".length));
      continue;
    }

    if (arg.startsWith("--limit=")) {
      const parsed = Number(arg.slice("--limit=".length));
      if (Number.isFinite(parsed) && parsed > 0) {
        limit = Math.floor(parsed);
      }
    }
  }

  return { apply, refreshExisting, from, to, limit };
}

function getPayloadNewEstado(event: EventRecord): string {
  const payload =
    event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
      ? (event.payload as Record<string, unknown>)
      : null;
  return typeof payload?.newEstado === "string" ? payload.newEstado : "";
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const where: {
    type: "OPERACION_CERRADA";
    createdAt?: { gte?: Date; lte?: Date };
  } = { type: "OPERACION_CERRADA" };

  if (options.from || options.to) {
    where.createdAt = {};
    if (options.from) where.createdAt.gte = options.from;
    if (options.to) where.createdAt.lte = options.to;
  }

  const events = await prisma.event.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take: options.limit,
  });

  const sourceEventIds = events.map((event) => event.id);
  const existingFacts = sourceEventIds.length
    ? await prisma.commercialOperationFact.findMany({
        where: { sourceEventId: { in: sourceEventIds } },
        select: { sourceEventId: true },
      })
    : [];
  const existingBySourceId = new Set(existingFacts.map((row) => row.sourceEventId));

  let skippedExisting = 0;
  let skippedNonClosed = 0;
  let attempted = 0;
  let upserted = 0;
  let failed = 0;

  for (const event of events) {
    if (!options.refreshExisting && existingBySourceId.has(event.id)) {
      skippedExisting++;
      continue;
    }

    const newEstado = getPayloadNewEstado(event);
    if (!isClosedOperation(newEstado)) {
      skippedNonClosed++;
      continue;
    }

    attempted++;
    if (!options.apply) continue;

    try {
      await upsertCommercialOperationFactFromOperacionCerradaEvent(event);
      upserted++;
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[backfill-commercial-operation-facts] sourceEventId=${event.id} aggregateId=${event.aggregateId} error=${message}`,
      );
    }
  }

  console.log("[backfill-commercial-operation-facts] summary");
  console.log(`  mode: ${options.apply ? "apply" : "dry-run"}`);
  console.log(`  refreshExisting: ${options.refreshExisting ? "yes" : "no"}`);
  console.log(`  range.from: ${options.from?.toISOString() ?? "none"}`);
  console.log(`  range.to: ${options.to?.toISOString() ?? "none"}`);
  console.log(`  scannedEvents: ${events.length}`);
  console.log(`  skippedExistingFacts: ${skippedExisting}`);
  console.log(`  skippedNonClosedEstado: ${skippedNonClosed}`);
  console.log(`  eligibleToUpsert: ${attempted}`);
  console.log(`  upserted: ${upserted}`);
  console.log(`  failed: ${failed}`);
}

main()
  .catch((err) => {
    console.error("[backfill-commercial-operation-facts] fatal:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
