/**
 * Test puntual: pide al Market Worker el detalle de UN solo listing
 * Idealista y muestra la respuesta cruda.
 *
 * Objetivo: aislar el comportamiento del worker para Idealista sin pasar
 * por la cola ni el handler. Si la respuesta es 200 con detail, sabemos
 * que el problema es de orquestacion. Si la respuesta es error/timeout,
 * tenemos la traza exacta para revisar logs del worker en Railway.
 *
 * Uso:
 *   # Con un listing concreto (canonicalUrl + externalId):
 *   npx tsx scripts/test-idealista-detail-single.ts <canonicalUrl> [externalId]
 *
 *   # Con un listing ya en la DB (busca por id):
 *   npx tsx scripts/test-idealista-detail-single.ts --listing-id <listingId>
 *
 *   # Toma el primer Idealista sin telefono de la DB:
 *   npx tsx scripts/test-idealista-detail-single.ts --auto
 *
 * El script NO escribe en la cola. Solo hace una llamada HTTP al worker.
 * Usa MARKET_WORKER_REQUEST_TIMEOUT_MS del .env (subido a 90s) y
 * MARKET_DETAIL_TIMEOUT_MS del worker (default 45s).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { MarketWorkerClient } from "@/lib/workers/contracts/market-worker-client";
import { MarketWorkerError } from "@/lib/workers/contracts/market-worker";

function parseArgs(argv: string[]):
  | { kind: "url"; canonicalUrl: string; externalId?: string }
  | { kind: "listing-id"; listingId: string }
  | { kind: "auto" }
  | { kind: "help" } {
  if (argv.length === 0) return { kind: "help" };
  if (argv[0] === "--help" || argv[0] === "-h") return { kind: "help" };
  if (argv[0] === "--auto") return { kind: "auto" };
  if (argv[0] === "--listing-id" && argv[1]) {
    return { kind: "listing-id", listingId: argv[1] };
  }
  if (argv[0].startsWith("http")) {
    return { kind: "url", canonicalUrl: argv[0], externalId: argv[1] };
  }
  return { kind: "help" };
}

async function resolveListingByDb(
  prisma: PrismaClient,
  arg: { kind: "listing-id"; listingId: string } | { kind: "auto" },
): Promise<{ canonicalUrl: string; externalId: string | null; id: string }> {
  if (arg.kind === "listing-id") {
    const l = await prisma.marketListing.findUnique({
      where: { id: arg.listingId },
      select: { id: true, canonicalUrl: true, externalId: true },
    });
    if (!l) throw new Error(`No existe MarketListing con id=${arg.listingId}`);
    return l;
  }
  const l = await prisma.marketListing.findFirst({
    where: { source: "source_d", phones: { isEmpty: true } },
    select: { id: true, canonicalUrl: true, externalId: true },
    orderBy: { createdAt: "desc" },
  });
  if (!l) throw new Error("No hay Idealista sin telefono en la DB para --auto");
  return l;
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.kind === "help") {
    console.log(
      [
        "Uso:",
        "  npx tsx scripts/test-idealista-detail-single.ts <canonicalUrl> [externalId]",
        "  npx tsx scripts/test-idealista-detail-single.ts --listing-id <id>",
        "  npx tsx scripts/test-idealista-detail-single.ts --auto",
      ].join("\n"),
    );
    return;
  }

  const baseUrl = process.env.MARKET_WORKER_BASE_URL?.trim();
  const secret = process.env.MARKET_WORKER_SHARED_SECRET?.trim();
  if (!baseUrl || !secret) {
    console.error(
      "MARKET_WORKER_BASE_URL / MARKET_WORKER_SHARED_SECRET no definidas",
    );
    process.exit(2);
  }

  const requestTimeoutMs = Number(
    process.env.MARKET_WORKER_REQUEST_TIMEOUT_MS ?? 90_000,
  );
  const detailTimeoutMs = Number(process.env.MARKET_DETAIL_TIMEOUT_MS ?? 60_000);

  const prisma = new PrismaClient();
  let target: { canonicalUrl: string; externalId: string | null; id?: string };
  if (parsed.kind === "url") {
    target = {
      canonicalUrl: parsed.canonicalUrl,
      externalId: parsed.externalId ?? null,
    };
  } else {
    target = await resolveListingByDb(prisma, parsed);
  }

  const traceId = `test-idealista-${randomUUID().slice(0, 8)}`;
  const client = new MarketWorkerClient({
    baseUrl,
    secret,
    requestTimeoutMs,
  });

  console.log("=".repeat(80));
  console.log("TEST SINGLE-LISTING IDEALISTA (worker directo)");
  console.log("=".repeat(80));
  console.log(
    [
      `  workerBaseUrl       : ${baseUrl}`,
      `  requestTimeoutMs    : ${requestTimeoutMs}  (cliente local)`,
      `  detailTimeoutMs     : ${detailTimeoutMs}  (worker internamente)`,
      `  listingId           : ${target.id ?? "(url libre)"}`,
      `  canonicalUrl        : ${target.canonicalUrl}`,
      `  externalId          : ${target.externalId ?? "—"}`,
      `  traceId             : ${traceId}`,
    ].join("\n"),
  );
  console.log("");

  // Health primero, para tener el contexto del worker.
  try {
    const h = await client.health({ requestTimeoutMs: 5000 });
    console.log("  workerHealth:", JSON.stringify(h));
  } catch (err) {
    console.log(
      "  workerHealth: ERROR",
      err instanceof Error ? err.message : String(err),
    );
  }
  console.log("");

  const t0 = Date.now();
  try {
    const detail = await client.runCrawlDetail({
      source: "source_d",
      canonicalUrl: target.canonicalUrl,
      externalId: target.externalId ?? undefined,
      timeoutMs: detailTimeoutMs,
      traceId,
    });
    const tMs = Date.now() - t0;
    console.log(`  Resultado en ${tMs}ms:`);
    console.log("");
    console.log(JSON.stringify(detail, null, 2));
  } catch (err) {
    const tMs = Date.now() - t0;
    if (err instanceof MarketWorkerError) {
      console.log(`  ERROR ${err.code} tras ${tMs}ms:`);
      console.log(`    message: ${err.message}`);
      console.log(`    httpStatus: ${err.httpStatus ?? "—"}`);
    } else {
      console.log(`  ERROR tras ${tMs}ms:`);
      console.log(`    ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[test-idealista-detail-single] fatal:", err);
  process.exit(1);
});
