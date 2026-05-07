/**
 * Smoke E2E del Market Worker contra una instancia local + Neon real.
 *
 * Portales activos en MVP: `fotocasa`, `pisoscom`.
 * `milanuncios` se conserva como portal soportado por el script (para
 * reactivación futura con Bright Data) pero el worker NO tiene extractor
 * registrado y la invocación devolverá un error claro.
 *
 * Flujo:
 *   1. Resuelve el portal y ciudad → URL semilla por defecto del portal.
 *   2. Crea (o reutiliza) un MarketSeed en DB para esa combinación.
 *   3. Crea un MarketCrawlRun en estado RUNNING.
 *   4. Llama al Worker local (HTTP) con el contrato MarketCrawlSeedRequest.
 *   5. Imprime el resultado y verifica el estado final del run + el conteo
 *      de MarketRawListing persistidos.
 *
 * Pre-requisitos:
 *   - Worker local arrancado (Docker o `npm run dev` en workers/market-worker).
 *   - El Worker debe tener registrado el extractor del portal solicitado.
 *   - .env del repo principal con:
 *       MARKET_WORKER_BASE_URL=http://127.0.0.1:8080
 *       MARKET_WORKER_SHARED_SECRET=<el mismo del worker>
 *       DATABASE_URL=<Neon>
 *
 * Uso:
 *   npx tsx scripts/test-market-worker-local.ts --portal fotocasa --limit 1
 *   npx tsx scripts/test-market-worker-local.ts --portal pisoscom --limit 1
 *   npx tsx scripts/test-market-worker-local.ts --portal milanuncios --limit 1   (FUERA DE MVP — devolverá error)
 *   npx tsx scripts/test-market-worker-local.ts --portal pisoscom --url "https://www.pisos.com/venta/pisos-cordoba_capital/"
 */

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { MarketWorkerClient } from "@/lib/workers/contracts/market-worker-client";
import { sourceForPortal, type PortalSlug } from "@/lib/market";

const PORTAL_DEFAULTS: Record<
  Exclude<PortalSlug, "unknown">,
  { city: string; url: string }
> = {
  fotocasa: {
    city: "cordoba",
    url: "https://www.fotocasa.es/es/comprar/viviendas/cordoba-capital/todas-las-zonas/l",
  },
  pisoscom: {
    city: "cordoba",
    url: "https://www.pisos.com/venta/pisos-cordoba_capital/",
  },
  milanuncios: {
    city: "cordoba",
    url: "https://www.milanuncios.com/inmuebles/comprar-casas-cordoba.htm",
  },
  idealista: {
    city: "cordoba",
    // Default seed: el segundo del §11.2 (con-pisos) — el mas
    // representativo del stock real de Cordoba.
    url: "https://www.idealista.com/venta-viviendas/cordoba-cordoba/con-pisos/",
  },
};

type SupportedPortal = keyof typeof PORTAL_DEFAULTS;

interface CliOptions {
  portal: SupportedPortal;
  city: string;
  url: string;
  limit: number;
  budgetMs: number;
  budgetRequests: number;
  deadlineMs: number;
  forceNewSeed: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    portal: "fotocasa",
    city: PORTAL_DEFAULTS.fotocasa.city,
    url: PORTAL_DEFAULTS.fotocasa.url,
    limit: 1,
    budgetMs: 60_000,
    budgetRequests: 5,
    deadlineMs: 30_000,
    forceNewSeed: false,
  };
  let cityOverride: string | null = null;
  let urlOverride: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--portal" && next) {
      if (!isSupportedPortal(next)) {
        throw new Error(
          `--portal debe ser uno de: ${Object.keys(PORTAL_DEFAULTS).join(", ")} (recibido: ${next})`,
        );
      }
      opts.portal = next;
      i++;
    } else if (a === "--city" && next) {
      cityOverride = next;
      i++;
    } else if (a === "--url" && next) {
      urlOverride = next;
      i++;
    } else if (a === "--limit" && next) {
      opts.limit = Math.max(1, Number(next));
      opts.budgetRequests = Math.max(opts.limit, 1);
      i++;
    } else if (a === "--budget-ms" && next) {
      opts.budgetMs = Number(next);
      i++;
    } else if (a === "--budget-requests" && next) {
      opts.budgetRequests = Number(next);
      i++;
    } else if (a === "--deadline-ms" && next) {
      opts.deadlineMs = Number(next);
      i++;
    } else if (a === "--force-new-seed") {
      opts.forceNewSeed = true;
    } else if (a === "--help" || a === "-h") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Argumento no reconocido: ${a}`);
    }
  }
  // Aplicar defaults derivados del portal seleccionado.
  const portalDefaults = PORTAL_DEFAULTS[opts.portal];
  opts.city = cityOverride ?? portalDefaults.city;
  opts.url = urlOverride ?? portalDefaults.url;
  return opts;
}

function isSupportedPortal(value: string): value is SupportedPortal {
  return value in PORTAL_DEFAULTS;
}

function printUsage(): void {
  console.log(
    [
      "test-market-worker-local — smoke E2E del Market Worker.",
      "",
      "Opciones:",
      "  --portal <fotocasa|pisoscom|idealista>     default: fotocasa  (milanuncios fuera de MVP)",
      "  --city <slug>                              default: por portal (típicamente cordoba)",
      "  --url <URL>                                URL semilla; sobreescribe el default del portal",
      "  --limit <N>                                Páginas máximas (default: 1)",
      "  --budget-ms <N>                            Budget global en ms (default: 60000)",
      "  --budget-requests <N>                      Budget de requests (default: limit)",
      "  --deadline-ms <N>                          Ventana sincrónica del cliente (default: 30000)",
      "  --force-new-seed                           No reutilizar seed existente",
    ].join("\n"),
  );
}

async function ensureSeed(opts: CliOptions): Promise<string> {
  const source = sourceForPortal(opts.portal);
  if (!opts.forceNewSeed) {
    const existing = await prisma.marketSeed.findFirst({
      where: { source, operation: "sale", url: opts.url },
      orderBy: { createdAt: "asc" },
    });
    if (existing) {
      console.log(`[smoke] reutilizando seed existente id=${existing.id}`);
      return existing.id;
    }
  }
  const created = await prisma.marketSeed.create({
    data: {
      source,
      operation: "sale",
      city: opts.city,
      url: opts.url,
      active: true,
      cadenceMinutes: 120,
      notes: `seed creado por scripts/test-market-worker-local.ts (portal=${opts.portal})`,
    },
  });
  console.log(`[smoke] seed creado id=${created.id} (portal=${opts.portal})`);
  return created.id;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const baseUrl = process.env.MARKET_WORKER_BASE_URL?.trim();
  const secret = process.env.MARKET_WORKER_SHARED_SECRET?.trim();
  if (!baseUrl || !secret) {
    console.error(
      "[smoke] Falta MARKET_WORKER_BASE_URL o MARKET_WORKER_SHARED_SECRET en .env",
    );
    process.exit(2);
  }

  const source = sourceForPortal(opts.portal);
  console.log(`[smoke] portal=${opts.portal} (source=${source}) city=${opts.city}`);
  console.log(`[smoke] url=${opts.url}`);

  const client = new MarketWorkerClient({
    baseUrl,
    secret,
    requestTimeoutMs: opts.deadlineMs + 5_000,
  });

  console.log(`[smoke] comprobando ${baseUrl}/internal/health…`);
  try {
    const h = await client.health();
    console.log(`[smoke] health=${JSON.stringify(h)}`);
  } catch (err) {
    console.error(`[smoke] worker no responde: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(3);
  }

  const seedId = await ensureSeed(opts);
  const traceId = `smoke-${randomUUID().slice(0, 8)}`;
  const correlationId = traceId;

  const run = await prisma.marketCrawlRun.create({
    data: {
      seedId,
      source,
      status: "RUNNING",
      budgetMs: opts.budgetMs,
      budgetRequests: opts.budgetRequests,
      cursorIn: null,
      correlationId,
    },
  });
  console.log(`[smoke] run creado id=${run.id} correlationId=${correlationId}`);

  const start = Date.now();
  let response;
  try {
    response = await client.runCrawlSeed({
      runId: run.id,
      seedId,
      source,
      operation: "sale",
      url: opts.url,
      cursor: null,
      budgetMs: opts.budgetMs,
      budgetRequests: opts.budgetRequests,
      deadlineMs: opts.deadlineMs,
      traceId,
    });
  } catch (err) {
    console.error(
      `[smoke] cliente lanzó: ${err instanceof Error ? err.name + ": " + err.message : String(err)}`,
    );
    process.exit(4);
  }
  const elapsedMs = Date.now() - start;

  console.log(`[smoke] respuesta worker (${elapsedMs}ms): ${JSON.stringify(response, null, 2)}`);

  const finalRun = await prisma.marketCrawlRun.findUnique({ where: { id: run.id } });
  const rawCount = await prisma.marketRawListing.count({
    where: { crawlRunId: run.id },
  });
  console.log(
    `[smoke] estado final run=${finalRun?.status} pages=${finalRun?.pagesScanned} captured=${finalRun?.itemsCaptured} rejected=${finalRun?.itemsRejected} raw_persisted=${rawCount}`,
  );

  if (response.status === "completed") {
    console.log("[smoke] OK ✔");
    if (rawCount === 0) {
      console.warn(
        "[smoke] AVISO: el worker reportó completed pero no hay raw listings. ¿Bloqueo silencioso? ¿selectores fuera?",
      );
    }
    process.exit(0);
  }
  if (response.status === "accepted") {
    console.log(
      "[smoke] worker aceptó en background; comprueba el run en unos segundos para ver si terminó",
    );
    process.exit(0);
  }
  console.error(`[smoke] worker no completó (status=${response.status})`);
  process.exit(1);
}

main().catch((err) => {
  console.error("[smoke] fallo fatal:", err);
  process.exit(99);
});
