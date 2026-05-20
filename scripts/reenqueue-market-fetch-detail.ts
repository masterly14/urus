/**
 * Reencola jobs MARKET_FETCH_DETAIL para listings que se quedaron sin
 * teléfono enriquecido en la última ola de captacion.
 *
 * Contexto (auditoria scripts/diagnose-market-phone-enrichment.ts del 2026-05-19):
 *   - 160 Idealista (source_d) con detailFetchAttempts=0 y MARKET_FETCH_DETAIL
 *     en estado COMPLETED ⇒ jobs procesados antes de tener MARKET_WORKER_*
 *     o BRIGHTDATA_* configurados; el handler hizo early-return success sin
 *     trabajo real.
 *   - 119 Pisos.com (source_b) con jobs MARKET_FETCH_DETAIL en DEAD_LETTER
 *     por `worker_network` ⇒ fallos transitorios de conectividad con el
 *     worker en Railway.
 *   -   4 Fotocasa (source_a) con detailFetched=true pero phones=[] ⇒ HTML
 *     bloqueado por PerimeterX porque MARKET_FOTOCASA_USE_BRIGHTDATA no
 *     estaba activado en el worker.
 *
 * Tras corregir la configuracion del worker (Railway: MARKET_WORKER_BASE_URL,
 * MARKET_WORKER_SHARED_SECRET, BRIGHTDATA_API_TOKEN, BRIGHTDATA_WEB_UNLOCKER_ZONE,
 * MARKET_FOTOCASA_USE_BRIGHTDATA=1, BRIGHTDATA_SCRAPING_BROWSER_URL,
 * MARKET_IDEALISTA_ENABLED=1, BRIGHTDATA_RESIDENTIAL_PROXY_URL) este script
 * vuelve a poner los listings afectados en la cola.
 *
 * Mecanica:
 *   1. Selecciona los listings target segun --target y --source.
 *   2. Filtra los que ya estan completos (phones+description+images) o
 *      que ya consumieron MAX_DETAIL_FETCH_ATTEMPTS (3) intentos.
 *   3. Encola MARKET_FETCH_DETAIL con idempotencyKey nueva:
 *      `market:fetch-detail:<listingId>:reenqueue:<batchId>`. La key vieja
 *      (`market:fetch-detail:<listingId>`) queda intacta en COMPLETED/DEAD_LETTER.
 *   4. Si --spread-ms > 0, escalona availableAt para no saturar al worker
 *      (concurrencia=2 en MarketWorkerRuntime; con spread=8000ms cada job
 *      llega ~8s despues del anterior).
 *
 * Modo:
 *   - DRY-RUN por defecto. Usa --apply para escribir en la cola.
 *
 * Uso:
 *   npx tsx scripts/reenqueue-market-fetch-detail.ts                     # dry-run, todo
 *   npx tsx scripts/reenqueue-market-fetch-detail.ts --apply             # ejecutar
 *   npx tsx scripts/reenqueue-market-fetch-detail.ts --source source_d   # solo Idealista
 *   npx tsx scripts/reenqueue-market-fetch-detail.ts --target dead-letter --apply
 *   npx tsx scripts/reenqueue-market-fetch-detail.ts --limit 20 --apply  # primeros 20
 *   npx tsx scripts/reenqueue-market-fetch-detail.ts --spread-ms 10000 --apply
 *
 * Tras ejecutar:
 *   - El cron /api/cron/consumer (Vercel) los procesara automaticamente.
 *   - Tambien puedes drenar localmente con: npx tsx scripts/run-consumer.ts
 *   - Audita progreso con: npx tsx scripts/diagnose-market-phone-enrichment.ts
 */
import "dotenv/config";
import {
  PrismaClient,
  type MarketSource,
  type JobStatus,
  type Prisma,
} from "@prisma/client";
import { enqueueJob } from "@/lib/job-queue";

const MAX_DETAIL_FETCH_ATTEMPTS = 3;
const VALID_SOURCES: MarketSource[] = [
  "source_a",
  "source_b",
  "source_c",
  "source_d",
];

const SOURCE_LABELS: Record<MarketSource, string> = {
  source_a: "Fotocasa",
  source_b: "Pisos.com",
  source_c: "Habitaclia",
  source_d: "Idealista",
};

type TargetMode = "missing-phone" | "dead-letter" | "both";

interface CliOptions {
  apply: boolean;
  sources: MarketSource[] | null; // null = todas
  target: TargetMode;
  limit: number | null;
  batchId: string;
  priority: number;
  spreadMs: number;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    apply: false,
    sources: null,
    target: "both",
    limit: null,
    batchId: new Date().toISOString().replace(/[:.]/g, "-"),
    priority: 200,
    spreadMs: 0,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--apply") {
      opts.apply = true;
    } else if (a === "--source" && next) {
      const list = next.split(",").map((s) => s.trim());
      for (const s of list) {
        if (!VALID_SOURCES.includes(s as MarketSource)) {
          throw new Error(
            `--source debe ser uno de: ${VALID_SOURCES.join(", ")} (recibido: ${s})`,
          );
        }
      }
      opts.sources = list as MarketSource[];
      i++;
    } else if (a === "--target" && next) {
      if (!["missing-phone", "dead-letter", "both"].includes(next)) {
        throw new Error(
          `--target debe ser missing-phone | dead-letter | both (recibido: ${next})`,
        );
      }
      opts.target = next as TargetMode;
      i++;
    } else if (a === "--limit" && next) {
      const n = Number(next);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`--limit debe ser entero positivo (recibido: ${next})`);
      }
      opts.limit = Math.floor(n);
      i++;
    } else if (a === "--batch-id" && next) {
      opts.batchId = next;
      i++;
    } else if (a === "--priority" && next) {
      const n = Number(next);
      if (!Number.isFinite(n)) {
        throw new Error(`--priority debe ser numero (recibido: ${next})`);
      }
      opts.priority = Math.floor(n);
      i++;
    } else if (a === "--spread-ms" && next) {
      const n = Number(next);
      if (!Number.isFinite(n) || n < 0) {
        throw new Error(`--spread-ms debe ser >=0 (recibido: ${next})`);
      }
      opts.spreadMs = Math.floor(n);
      i++;
    } else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Argumento no reconocido: ${a}`);
    }
  }
  return opts;
}

function printHelp(): void {
  console.log(
    [
      "Uso: npx tsx scripts/reenqueue-market-fetch-detail.ts [opciones]",
      "",
      "Opciones:",
      "  --apply                   Ejecutar (sin esto solo es DRY-RUN).",
      "  --source <a,b,c,d|csv>    Limitar a fuentes especificas (default: todas).",
      "                            Valores: source_a, source_b, source_c, source_d.",
      "  --target <modo>           missing-phone | dead-letter | both (default: both).",
      "                            - missing-phone: listings con phones=[] y attempts<3.",
      "                            - dead-letter: listings cuyo MARKET_FETCH_DETAIL",
      "                              esta en DEAD_LETTER.",
      "  --limit N                 Limita el numero de jobs encolados (debug).",
      "  --batch-id <id>           ID estable para la idempotencyKey del batch.",
      "                            Default: ISO timestamp de la ejecucion.",
      "  --priority N              Prioridad del job (default: 200).",
      "  --spread-ms N             Escalona availableAt N ms entre jobs (default: 0).",
      "                            Recomendado 8000-12000 cuando hay >100 jobs y",
      "                            el worker tiene concurrencia=2.",
      "  -h, --help                Esta ayuda.",
    ].join("\n"),
  );
}

interface CandidateListing {
  id: string;
  source: MarketSource;
  canonicalUrl: string | null;
  detailFetchAttempts: number;
  phones: string[];
  description: string | null;
  imageUrls: string[];
  reason: "missing-phone" | "dead-letter" | "both";
}

async function selectCandidates(
  prisma: PrismaClient,
  opts: CliOptions,
): Promise<{
  candidates: CandidateListing[];
  skippedMaxAttempts: number;
  skippedComplete: number;
}> {
  const sourceFilter: Prisma.MarketListingWhereInput =
    opts.sources && opts.sources.length > 0
      ? { source: { in: opts.sources } }
      : {};

  const missingPhoneListings =
    opts.target === "missing-phone" || opts.target === "both"
      ? await prisma.marketListing.findMany({
          where: {
            ...sourceFilter,
            phones: { isEmpty: true },
          },
          select: {
            id: true,
            source: true,
            canonicalUrl: true,
            detailFetchAttempts: true,
            phones: true,
            description: true,
            imageUrls: true,
          },
          orderBy: { id: "asc" },
        })
      : [];

  let deadLetterListings: Array<{
    id: string;
    source: MarketSource;
    canonicalUrl: string | null;
    detailFetchAttempts: number;
    phones: string[];
    description: string | null;
    imageUrls: string[];
  }> = [];
  if (opts.target === "dead-letter" || opts.target === "both") {
    // Listings cuyo MARKET_FETCH_DETAIL acabo en DEAD_LETTER.
    // Selectionamos via SQL para no cargar todos los jobs en memoria.
    const dlJobs = await prisma.jobQueue.findMany({
      where: {
        type: "MARKET_FETCH_DETAIL",
        status: "DEAD_LETTER" satisfies JobStatus,
      },
      select: { payload: true },
    });
    const dlListingIds = new Set<string>();
    for (const job of dlJobs) {
      const lid =
        job.payload && typeof job.payload === "object" && !Array.isArray(job.payload)
          ? (job.payload as { listingId?: unknown }).listingId
          : undefined;
      if (typeof lid === "string") dlListingIds.add(lid);
    }
    if (dlListingIds.size > 0) {
      deadLetterListings = await prisma.marketListing.findMany({
        where: {
          ...sourceFilter,
          id: { in: [...dlListingIds] },
        },
        select: {
          id: true,
          source: true,
          canonicalUrl: true,
          detailFetchAttempts: true,
          phones: true,
          description: true,
          imageUrls: true,
        },
        orderBy: { id: "asc" },
      });
    }
  }

  const byId = new Map<string, CandidateListing>();
  for (const l of missingPhoneListings) {
    byId.set(l.id, { ...l, reason: "missing-phone" });
  }
  for (const l of deadLetterListings) {
    const prev = byId.get(l.id);
    if (prev) {
      prev.reason = "both";
    } else {
      byId.set(l.id, { ...l, reason: "dead-letter" });
    }
  }

  let skippedMaxAttempts = 0;
  let skippedComplete = 0;
  const candidates: CandidateListing[] = [];
  for (const l of byId.values()) {
    const hasPhones = (l.phones ?? []).some((p) => typeof p === "string" && p.trim().length > 0);
    const hasDescription = (l.description ?? "").trim().length > 0;
    const hasImages = (l.imageUrls ?? []).length > 0;
    if (hasPhones && hasDescription && hasImages) {
      skippedComplete++;
      continue;
    }
    if (l.detailFetchAttempts >= MAX_DETAIL_FETCH_ATTEMPTS) {
      skippedMaxAttempts++;
      continue;
    }
    candidates.push(l);
  }

  // Orden: por source, luego por id para estabilidad.
  candidates.sort((a, b) =>
    a.source === b.source ? a.id.localeCompare(b.id) : a.source.localeCompare(b.source),
  );

  if (opts.limit !== null) {
    return {
      candidates: candidates.slice(0, opts.limit),
      skippedMaxAttempts,
      skippedComplete,
    };
  }
  return { candidates, skippedMaxAttempts, skippedComplete };
}

function summarizeBySource(candidates: CandidateListing[]): Map<MarketSource, number> {
  const out = new Map<MarketSource, number>();
  for (const c of candidates) {
    out.set(c.source, (out.get(c.source) ?? 0) + 1);
  }
  return out;
}

function summarizeByReason(candidates: CandidateListing[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of candidates) {
    out.set(c.reason, (out.get(c.reason) ?? 0) + 1);
  }
  return out;
}

function pad(value: string | number, width: number): string {
  const s = String(value);
  if (s.length >= width) return s;
  return s + " ".repeat(width - s.length);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  const t0 = Date.now();

  console.log("=".repeat(80));
  console.log("REENCOLADO DE MARKET_FETCH_DETAIL — Motor de Captacion");
  console.log("=".repeat(80));
  console.log(
    [
      `  modo            : ${opts.apply ? "APPLY (escribira en la cola)" : "DRY-RUN (no escribe)"}`,
      `  target          : ${opts.target}`,
      `  sources         : ${opts.sources ? opts.sources.join(",") : "(todas)"}`,
      `  limit           : ${opts.limit ?? "(sin limite)"}`,
      `  batchId         : ${opts.batchId}`,
      `  priority        : ${opts.priority}`,
      `  spreadMs        : ${opts.spreadMs} (escalonado de availableAt)`,
      `  workerBaseUrl   : ${process.env.MARKET_WORKER_BASE_URL ?? "(no definida)"}`,
      `  workerSecret    : ${process.env.MARKET_WORKER_SHARED_SECRET ? "(definida)" : "(NO definida)"}`,
    ].join("\n"),
  );
  console.log("");

  if (!process.env.MARKET_WORKER_BASE_URL || !process.env.MARKET_WORKER_SHARED_SECRET) {
    console.warn(
      "  ! Aviso: MARKET_WORKER_BASE_URL o MARKET_WORKER_SHARED_SECRET no estan",
      "\n    definidas en este shell. Esto es OK si la cola la procesa Vercel/Railway",
      "\n    donde si lo estan; pero si vas a drenar localmente, define las envs antes.",
    );
    console.log("");
  }

  console.log("[1/3] Selecciono listings target");
  console.log("-".repeat(80));
  const { candidates, skippedMaxAttempts, skippedComplete } = await selectCandidates(
    prisma,
    opts,
  );

  const bySource = summarizeBySource(candidates);
  const byReason = summarizeByReason(candidates);

  console.log(`  candidatos a reencolar : ${candidates.length}`);
  console.log(`  saltados (ficha ok)    : ${skippedComplete}`);
  console.log(`  saltados (attempts>=3) : ${skippedMaxAttempts}`);
  console.log("");
  if (bySource.size > 0) {
    console.log("  por portal:");
    for (const src of VALID_SOURCES) {
      const n = bySource.get(src) ?? 0;
      if (n === 0) continue;
      console.log(`    ${pad(SOURCE_LABELS[src], 12)} (${src}) — ${n}`);
    }
    console.log("");
  }
  if (byReason.size > 0) {
    console.log("  por motivo:");
    for (const [reason, n] of byReason.entries()) {
      console.log(`    ${pad(reason, 15)} — ${n}`);
    }
    console.log("");
  }

  if (candidates.length === 0) {
    console.log("  Nada que reencolar. Fin.");
    await prisma.$disconnect();
    return;
  }

  console.log("[2/3] Vista previa (primeros 5)");
  console.log("-".repeat(80));
  for (const c of candidates.slice(0, 5)) {
    console.log(
      `  ${c.id}  ${c.source}  attempts=${c.detailFetchAttempts}  reason=${c.reason}  ${c.canonicalUrl ?? ""}`,
    );
  }
  if (candidates.length > 5) {
    console.log(`  … (+${candidates.length - 5} mas)`);
  }
  console.log("");

  if (!opts.apply) {
    console.log("[3/3] DRY-RUN — no se escribe en la cola");
    console.log("-".repeat(80));
    console.log(
      "  Repite con --apply para ejecutar. Para escalonar y no saturar el worker:",
    );
    console.log(
      `    npx tsx scripts/reenqueue-market-fetch-detail.ts --apply --spread-ms 10000`,
    );
    console.log("");
    await prisma.$disconnect();
    return;
  }

  console.log("[3/3] Encolando");
  console.log("-".repeat(80));
  const baseAvailableAt = Date.now();
  let enqueued = 0;
  let failures = 0;
  const errors: Array<{ listingId: string; error: string }> = [];

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const availableAt =
      opts.spreadMs > 0 ? new Date(baseAvailableAt + i * opts.spreadMs) : undefined;
    const idempotencyKey = `market:fetch-detail:${c.id}:reenqueue:${opts.batchId}`;
    try {
      const job = await enqueueJob({
        type: "MARKET_FETCH_DETAIL",
        payload: { listingId: c.id },
        idempotencyKey,
        priority: opts.priority,
        maxAttempts: 3,
        ...(availableAt ? { availableAt } : {}),
      });
      enqueued++;
      if (enqueued <= 3 || enqueued % 25 === 0) {
        console.log(
          `  + ${pad(String(enqueued), 4)} ${c.source}  listing=${c.id}  jobId=${job.id}` +
            (availableAt ? `  availableAt=${availableAt.toISOString()}` : ""),
        );
      }
    } catch (err) {
      failures++;
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ listingId: c.id, error: message });
      console.error(`  ! fallo listing=${c.id}: ${message}`);
    }
  }

  console.log("");
  console.log("=".repeat(80));
  console.log("RESUMEN");
  console.log("=".repeat(80));
  console.log(`  encolados              : ${enqueued}`);
  console.log(`  errores                : ${failures}`);
  console.log(`  duracion               : ${Math.round((Date.now() - t0) / 1000)}s`);
  if (opts.spreadMs > 0 && candidates.length > 1) {
    const totalSpreadSec = Math.round(((candidates.length - 1) * opts.spreadMs) / 1000);
    console.log(
      `  ultimo availableAt en  : +${totalSpreadSec}s (asegura que el cron drene varias veces)`,
    );
  }
  if (errors.length > 0) {
    console.log("");
    console.log("  primeros errores:");
    for (const e of errors.slice(0, 5)) {
      console.log(`    - ${e.listingId}: ${e.error}`);
    }
  }
  console.log("");
  console.log("Siguiente paso:");
  console.log("  - El cron /api/cron/consumer (Vercel) ya los procesara.");
  console.log("  - Audita progreso: npx tsx scripts/diagnose-market-phone-enrichment.ts");
  console.log("");

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[reenqueue-market-fetch-detail] fatal:", err);
  process.exit(1);
});
