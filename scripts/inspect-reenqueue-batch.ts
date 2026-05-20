/**
 * Inspecciona el estado de un batch concreto de reencolado de
 * MARKET_FETCH_DETAIL, identificado por su `batchId`.
 *
 * Para cada job del batch muestra: estado actual, intentos, error y el
 * snapshot del listing asociado (phones, detailFetched, detailFetchAttempts,
 * captacionLastError).
 *
 * Tambien hace un health check del worker remoto para enmarcar la lectura
 * (`processed`/`failed` desde el ultimo restart).
 *
 * Uso:
 *   npx tsx scripts/inspect-reenqueue-batch.ts <batchId>
 *   npx tsx scripts/inspect-reenqueue-batch.ts 2026-05-20T10-11-58-885Z
 *
 * El batchId es el que imprime scripts/reenqueue-market-fetch-detail.ts.
 */
import "dotenv/config";
import {
  PrismaClient,
  type JobStatus,
  type MarketSource,
} from "@prisma/client";

const SOURCE_LABELS: Record<MarketSource, string> = {
  source_a: "Fotocasa",
  source_b: "Pisos.com",
  source_c: "Habitaclia",
  source_d: "Idealista",
};

function pad(value: string | number, width: number): string {
  const s = String(value);
  if (s.length >= width) return s;
  return s + " ".repeat(width - s.length);
}

async function healthCheck(): Promise<void> {
  const baseUrl = process.env.MARKET_WORKER_BASE_URL?.trim();
  const secret = process.env.MARKET_WORKER_SHARED_SECRET?.trim();
  if (!baseUrl || !secret) {
    console.log("  worker: MARKET_WORKER_BASE_URL/SHARED_SECRET no definidas en este shell");
    return;
  }
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/internal/health`, {
      headers: { "x-worker-secret": secret },
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (!res.ok) {
      console.log(`  worker: HTTP ${res.status}`);
      return;
    }
    const body = (await res.json()) as Record<string, unknown>;
    console.log(`  worker: ${JSON.stringify(body)}`);
  } catch (err) {
    console.log(`  worker: error ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main(): Promise<void> {
  const batchId = process.argv[2];
  if (!batchId) {
    console.error("Uso: npx tsx scripts/inspect-reenqueue-batch.ts <batchId>");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  console.log("=".repeat(80));
  console.log(`INSPECCION DE BATCH ${batchId}`);
  console.log("=".repeat(80));
  console.log("");
  console.log("[1/3] Worker health");
  console.log("-".repeat(80));
  await healthCheck();
  console.log("");

  const keyPrefix = `market:fetch-detail:`;
  const keySuffix = `:reenqueue:${batchId}`;
  const jobs = await prisma.jobQueue.findMany({
    where: {
      type: "MARKET_FETCH_DETAIL",
      idempotencyKey: { contains: keySuffix },
    },
    select: {
      id: true,
      status: true,
      attempts: true,
      maxAttempts: true,
      idempotencyKey: true,
      payload: true,
      lastError: true,
      availableAt: true,
      completedAt: true,
      lockedAt: true,
    },
    orderBy: { idempotencyKey: "asc" },
  });

  console.log(`[2/3] Jobs del batch (${jobs.length})`);
  console.log("-".repeat(80));
  if (jobs.length === 0) {
    console.log("  No se han encontrado jobs con ese batchId.");
    await prisma.$disconnect();
    return;
  }

  const byStatus = new Map<JobStatus, number>();
  for (const j of jobs) {
    byStatus.set(j.status, (byStatus.get(j.status) ?? 0) + 1);
  }
  for (const [status, n] of byStatus.entries()) {
    console.log(`  ${pad(status, 14)} ${n}`);
  }
  console.log("");

  const listingIds: string[] = [];
  for (const j of jobs) {
    const lid =
      j.payload && typeof j.payload === "object" && !Array.isArray(j.payload)
        ? (j.payload as { listingId?: unknown }).listingId
        : undefined;
    if (typeof lid === "string") listingIds.push(lid);
  }

  const listings = await prisma.marketListing.findMany({
    where: { id: { in: listingIds } },
    select: {
      id: true,
      source: true,
      canonicalUrl: true,
      phones: true,
      description: true,
      imageUrls: true,
      detailFetchAttempts: true,
      detailFetchedAt: true,
      captacionLastError: true,
      advertiserType: true,
    },
  });
  const listingById = new Map(listings.map((l) => [l.id, l]));

  console.log("[3/3] Detalle por job (job + listing)");
  console.log("-".repeat(80));
  let withPhone = 0;
  for (const j of jobs) {
    const lid =
      j.payload && typeof j.payload === "object" && !Array.isArray(j.payload)
        ? (j.payload as { listingId?: unknown }).listingId
        : undefined;
    if (typeof lid !== "string") continue;
    const l = listingById.get(lid);
    const phones = l?.phones ?? [];
    if (phones.length > 0) withPhone++;
    const ll = l ? SOURCE_LABELS[l.source] : "?";
    const phoneSnippet = phones.length > 0 ? phones.slice(0, 2).join(",") : "—";
    const ageStr = j.availableAt
      ? `availableAt=${j.availableAt.toISOString().slice(11, 19)}`
      : "";
    console.log(
      `  ${pad(j.status, 12)} ${pad(ll, 11)} listing=${lid}  attempts=${l?.detailFetchAttempts ?? "?"}  phones=[${phoneSnippet}]  err=${l?.captacionLastError ?? "—"}  ${ageStr}`,
    );
    if (j.lastError) {
      console.log(`    jobError: ${j.lastError.slice(0, 200)}`);
    }
  }
  console.log("");
  console.log("=".repeat(80));
  console.log(`RESUMEN: ${withPhone}/${listings.length} listings con phones`);
  console.log("=".repeat(80));

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[inspect-reenqueue-batch] fatal:", err);
  process.exit(1);
});
