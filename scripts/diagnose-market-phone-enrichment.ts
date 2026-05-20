/**
 * Auditoría completa del enriquecimiento de telefonos en el motor de
 * captacion (MarketListing → MARKET_FETCH_DETAIL → MarketAdvertiser).
 *
 * Pensado para responder a la pregunta "tengo N registros y ninguno tiene
 * telefono, ¿por que?" en una sola pasada, sin depender de varios scripts
 * dispersos.
 *
 * Recorre cuatro vias de fallo independientes (cualquiera tumba el
 * enriquecimiento end-to-end):
 *
 *  1. **Configuracion del entorno**
 *     - MARKET_WORKER_BASE_URL / MARKET_WORKER_SHARED_SECRET. Sin esto el
 *       handler `MARKET_FETCH_DETAIL` hace early-return con success
 *       (`console.warn → skip`) y NUNCA pide detalle. Failure mode #1.
 *     - Bright Data + MARKET_FOTOCASA_USE_BRIGHTDATA / MARKET_IDEALISTA_ENABLED.
 *       Sin estos, los portales protegidos por PerimeterX/DataDome devuelven
 *       HTML bloqueado y `parseFotocasaDetail` extrae `phones: []`.
 *
 *  2. **Salud del worker remoto**
 *     - GET /internal/health con el shared secret. Si el worker no responde
 *       o autoriza, los jobs entran a FAILED con `MarketWorkerError`.
 *
 *  3. **Cobertura por portal en `MarketListing`**
 *     - Total / con telefono / con descripcion / con imagenes / detail
 *       fetched / detailFetchAttempts maxed out / captacionLastError.
 *     - Distribucion de `advertiserType` (particular vs agency) y cuantos
 *       listings de cada uno tienen phones.
 *
 *  4. **Estado de la job queue `MARKET_FETCH_DETAIL`**
 *     - Conteos por status (PENDING, IN_PROGRESS, COMPLETED, FAILED,
 *       DEAD_LETTER). Si todo esta COMPLETED pero las filas no tienen
 *       phone, el handler ejecuto el early-return de "ficha completa" o
 *       no encolo el detalle nunca.
 *     - Top errores de los ultimos FAILED para descubrir si el worker
 *       devuelve `blocked` o `failed` (PerimeterX, captcha, timeout…).
 *
 *  5. **Cobertura agregada en `MarketAdvertiser`**
 *     - Total / con phoneCanonical / particular vs agency. Permite ver si
 *       el problema esta antes (no se extrae phone) o despues (se extrae
 *       pero `resolveByPhone` no resuelve).
 *
 * Al final, intenta diagnosticar la causa raiz mas probable a partir de
 * los datos observados y propone la siguiente accion concreta.
 *
 * Uso:
 *   npx tsx scripts/diagnose-market-phone-enrichment.ts            # toda la DB
 *   npx tsx scripts/diagnose-market-phone-enrichment.ts source_a   # solo Fotocasa
 *   npx tsx scripts/diagnose-market-phone-enrichment.ts --json     # salida JSON
 *
 * No escribe nada en la DB. No reencola jobs. Solo lectura.
 */
import "dotenv/config";
import {
  PrismaClient,
  type MarketSource,
  type JobStatus,
} from "@prisma/client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALL_SOURCES: MarketSource[] = [
  "source_a", // Fotocasa
  "source_b", // Pisos.com
  "source_c", // Milanuncios
  "source_d", // Idealista
];
const SOURCE_LABEL: Record<MarketSource, string> = {
  source_a: "Fotocasa",
  source_b: "Pisos.com",
  source_c: "Milanuncios",
  source_d: "Idealista",
};

const MAX_DETAIL_FETCH_ATTEMPTS = 3; // espejo de fetch-detail-handler.ts

function pct(n: number, d: number): string {
  if (d === 0) return "—";
  return `${Math.round((n / d) * 1000) / 10}%`;
}

function fmtBoolEnv(name: string): string {
  const raw = process.env[name];
  if (raw == null) return "(no definida)";
  if (raw === "") return "(vacía)";
  return raw;
}

function maskSecret(name: string): string {
  const raw = process.env[name];
  if (!raw) return "(no definida)";
  if (raw.length <= 8) return "***";
  return `${raw.slice(0, 4)}…${raw.slice(-2)} (len=${raw.length})`;
}

function parseArgs(): { sourceFilter: MarketSource | null; jsonOutput: boolean } {
  const args = process.argv.slice(2);
  let sourceFilter: MarketSource | null = null;
  let jsonOutput = false;
  for (const arg of args) {
    if (arg === "--json") {
      jsonOutput = true;
    } else if (
      arg === "source_a" ||
      arg === "source_b" ||
      arg === "source_c" ||
      arg === "source_d"
    ) {
      sourceFilter = arg;
    }
  }
  return { sourceFilter, jsonOutput };
}

// ---------------------------------------------------------------------------
// Section 1 — Configuracion de entorno
// ---------------------------------------------------------------------------

interface EnvCheck {
  workerBaseUrl: string;
  workerSecretSet: boolean;
  workerSecretPreview: string;
  workerRequestTimeoutMs: string;
  marketDetailTimeoutMs: string;
  brightDataApiTokenSet: boolean;
  brightDataWebUnlockerZone: string;
  brightDataResidentialProxyUrl: string;
  marketFotocasaUseBrightData: string;
  brightDataFotocasaZone: string;
  marketIdealistaEnabled: string;
  enableExternalPortfolioSearch: string;
  marketFeatureEnabled: string;
  marketWorkerCanCall: boolean;
}

function inspectEnv(): EnvCheck {
  const workerBaseUrl = process.env.MARKET_WORKER_BASE_URL?.trim() ?? "";
  const workerSecret = process.env.MARKET_WORKER_SHARED_SECRET?.trim() ?? "";
  return {
    workerBaseUrl: workerBaseUrl || "(no definida)",
    workerSecretSet: workerSecret.length > 0,
    workerSecretPreview: maskSecret("MARKET_WORKER_SHARED_SECRET"),
    workerRequestTimeoutMs: fmtBoolEnv("MARKET_WORKER_REQUEST_TIMEOUT_MS"),
    marketDetailTimeoutMs: fmtBoolEnv("MARKET_DETAIL_TIMEOUT_MS"),
    brightDataApiTokenSet: Boolean(process.env.BRIGHTDATA_API_TOKEN?.trim()),
    brightDataWebUnlockerZone: fmtBoolEnv("BRIGHTDATA_WEB_UNLOCKER_ZONE"),
    brightDataResidentialProxyUrl: fmtBoolEnv("BRIGHTDATA_RESIDENTIAL_PROXY_URL"),
    marketFotocasaUseBrightData: fmtBoolEnv("MARKET_FOTOCASA_USE_BRIGHTDATA"),
    brightDataFotocasaZone: fmtBoolEnv("BRIGHTDATA_FOTOCASA_WEB_UNLOCKER_ZONE"),
    marketIdealistaEnabled: fmtBoolEnv("MARKET_IDEALISTA_ENABLED"),
    enableExternalPortfolioSearch: fmtBoolEnv("ENABLE_EXTERNAL_PORTFOLIO_SEARCH"),
    marketFeatureEnabled: fmtBoolEnv("MARKET_FEATURE_ENABLED"),
    marketWorkerCanCall: Boolean(workerBaseUrl && workerSecret),
  };
}

// ---------------------------------------------------------------------------
// Section 2 — Health check del worker remoto
// ---------------------------------------------------------------------------

interface WorkerHealthCheck {
  attempted: boolean;
  reachable: boolean;
  httpStatus: number | null;
  body: unknown;
  errorMessage: string | null;
  latencyMs: number | null;
}

async function pingWorker(env: EnvCheck): Promise<WorkerHealthCheck> {
  if (!env.marketWorkerCanCall) {
    return {
      attempted: false,
      reachable: false,
      httpStatus: null,
      body: null,
      errorMessage:
        "MARKET_WORKER_BASE_URL o MARKET_WORKER_SHARED_SECRET no estan definidos",
      latencyMs: null,
    };
  }

  const baseUrl = env.workerBaseUrl.replace(/\/+$/, "");
  const url = `${baseUrl}/internal/health`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "x-market-worker-secret": process.env.MARKET_WORKER_SHARED_SECRET ?? "",
      },
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return {
      attempted: true,
      reachable: response.ok,
      httpStatus: response.status,
      body: parsed,
      errorMessage: response.ok ? null : `HTTP ${response.status}`,
      latencyMs: Date.now() - startedAt,
    };
  } catch (err) {
    return {
      attempted: true,
      reachable: false,
      httpStatus: null,
      body: null,
      errorMessage: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Section 3 — Cobertura por portal en MarketListing
// ---------------------------------------------------------------------------

interface PortalCoverage {
  source: MarketSource;
  label: string;
  total: number;
  withPhone: number;
  withDescription: number;
  withImages: number;
  withListingReference: number;
  withCadastralRef: number;
  detailFetched: number;
  attemptsMaxed: number;
  attemptsZero: number;
  attemptsOne: number;
  attemptsTwo: number;
  attemptsThreePlus: number;
  particularTotal: number;
  particularWithPhone: number;
  agencyTotal: number;
  agencyWithPhone: number;
  advertiserTypeUnknown: number;
  captacionLastErrorTop: Array<{ reason: string; count: number }>;
  recentListingsWithoutPhone: Array<{
    id: string;
    canonicalUrl: string;
    advertiserType: string | null;
    detailFetchAttempts: number;
    detailFetchedAt: Date | null;
    captacionLastError: string | null;
    lastSeenAt: Date;
  }>;
}

async function coverageBySource(
  prisma: PrismaClient,
  source: MarketSource,
): Promise<PortalCoverage | null> {
  const total = await prisma.marketListing.count({ where: { source } });
  if (total === 0) return null;

  const [
    withPhone,
    withDescription,
    withImages,
    withListingReference,
    withCadastralRef,
    detailFetched,
    attemptsMaxed,
    attemptsZero,
    attemptsOne,
    attemptsTwo,
    attemptsThreePlus,
    particularTotal,
    particularWithPhone,
    agencyTotal,
    agencyWithPhone,
    advertiserTypeUnknown,
    captacionLastErrorRaw,
    recentListingsWithoutPhone,
  ] = await Promise.all([
    prisma.marketListing.count({
      where: { source, phones: { isEmpty: false } },
    }),
    prisma.marketListing.count({
      where: { source, description: { not: null } },
    }),
    prisma.marketListing.count({
      where: { source, imageUrls: { isEmpty: false } },
    }),
    prisma.marketListing.count({
      where: { source, listingReference: { not: null } },
    }),
    prisma.marketListing.count({
      where: { source, cadastralRef: { not: null } },
    }),
    prisma.marketListing.count({
      where: { source, detailFetchedAt: { not: null } },
    }),
    prisma.marketListing.count({
      where: { source, detailFetchAttempts: { gte: MAX_DETAIL_FETCH_ATTEMPTS } },
    }),
    prisma.marketListing.count({
      where: { source, detailFetchAttempts: 0 },
    }),
    prisma.marketListing.count({
      where: { source, detailFetchAttempts: 1 },
    }),
    prisma.marketListing.count({
      where: { source, detailFetchAttempts: 2 },
    }),
    prisma.marketListing.count({
      where: { source, detailFetchAttempts: { gte: 3 } },
    }),
    prisma.marketListing.count({
      where: { source, advertiserType: "particular" },
    }),
    prisma.marketListing.count({
      where: {
        source,
        advertiserType: "particular",
        phones: { isEmpty: false },
      },
    }),
    prisma.marketListing.count({
      where: { source, advertiserType: "agency" },
    }),
    prisma.marketListing.count({
      where: {
        source,
        advertiserType: "agency",
        phones: { isEmpty: false },
      },
    }),
    prisma.marketListing.count({
      where: { source, advertiserType: null },
    }),
    prisma.marketListing.groupBy({
      by: ["captacionLastError"],
      where: { source, captacionLastError: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { id: "desc" } },
      take: 8,
    }),
    prisma.marketListing.findMany({
      where: { source, phones: { isEmpty: true } },
      orderBy: { lastSeenAt: "desc" },
      take: 5,
      select: {
        id: true,
        canonicalUrl: true,
        advertiserType: true,
        detailFetchAttempts: true,
        detailFetchedAt: true,
        captacionLastError: true,
        lastSeenAt: true,
      },
    }),
  ]);

  return {
    source,
    label: SOURCE_LABEL[source],
    total,
    withPhone,
    withDescription,
    withImages,
    withListingReference,
    withCadastralRef,
    detailFetched,
    attemptsMaxed,
    attemptsZero,
    attemptsOne,
    attemptsTwo,
    attemptsThreePlus,
    particularTotal,
    particularWithPhone,
    agencyTotal,
    agencyWithPhone,
    advertiserTypeUnknown,
    captacionLastErrorTop: captacionLastErrorRaw.map((row) => ({
      reason: row.captacionLastError ?? "(null)",
      count: row._count._all,
    })),
    recentListingsWithoutPhone,
  };
}

// ---------------------------------------------------------------------------
// Section 4 — Estado de la cola MARKET_FETCH_DETAIL
// ---------------------------------------------------------------------------

interface FetchDetailJobsState {
  totalsByStatus: Record<JobStatus, number>;
  totalAll: number;
  recentFailed: Array<{
    id: string;
    attempts: number;
    failedAt: Date | null;
    listingId: string | null;
    lastError: string;
  }>;
  failedSinceHours: number;
  errorPatterns: Array<{ pattern: string; count: number }>;
}

async function fetchDetailJobsState(
  prisma: PrismaClient,
): Promise<FetchDetailJobsState> {
  const grouped = await prisma.jobQueue.groupBy({
    by: ["status"],
    where: { type: "MARKET_FETCH_DETAIL" },
    _count: { _all: true },
  });
  const totalsByStatus: Record<JobStatus, number> = {
    PENDING: 0,
    IN_PROGRESS: 0,
    COMPLETED: 0,
    FAILED: 0,
    DEAD_LETTER: 0,
  };
  let totalAll = 0;
  for (const row of grouped) {
    totalsByStatus[row.status] = row._count._all;
    totalAll += row._count._all;
  }

  const failedSinceHours = 24;
  const since = new Date(Date.now() - failedSinceHours * 3600 * 1000);
  const recentFailed = await prisma.jobQueue.findMany({
    where: {
      type: "MARKET_FETCH_DETAIL",
      status: { in: ["FAILED", "DEAD_LETTER"] },
      OR: [{ failedAt: { gte: since } }, { updatedAt: { gte: since } }],
    },
    orderBy: { updatedAt: "desc" },
    take: 12,
    select: {
      id: true,
      attempts: true,
      failedAt: true,
      payload: true,
      lastError: true,
    },
  });

  const allFailed = await prisma.jobQueue.findMany({
    where: {
      type: "MARKET_FETCH_DETAIL",
      status: { in: ["FAILED", "DEAD_LETTER"] },
      lastError: { not: null },
    },
    take: 500,
    orderBy: { updatedAt: "desc" },
    select: { lastError: true },
  });

  const patternCount = new Map<string, number>();
  for (const job of allFailed) {
    const pattern = classifyJobError(job.lastError ?? "");
    patternCount.set(pattern, (patternCount.get(pattern) ?? 0) + 1);
  }
  const errorPatterns = [...patternCount.entries()]
    .map(([pattern, count]) => ({ pattern, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    totalsByStatus,
    totalAll,
    recentFailed: recentFailed.map((job) => ({
      id: job.id,
      attempts: job.attempts,
      failedAt: job.failedAt,
      listingId:
        typeof (job.payload as { listingId?: unknown } | null)?.listingId === "string"
          ? ((job.payload as { listingId: string }).listingId)
          : null,
      lastError: (job.lastError ?? "").slice(0, 280),
    })),
    failedSinceHours,
    errorPatterns,
  };
}

function classifyJobError(raw: string): string {
  const value = raw.toLowerCase();
  if (!value) return "(sin mensaje)";
  if (value.includes("worker blocked")) return "worker_blocked (PerimeterX/DataDome)";
  if (value.includes("unauthorized")) return "worker_unauthorized (secret mismatch)";
  if (value.includes("timeout")) return "worker_timeout";
  if (value.includes("network")) return "worker_network";
  if (value.includes("misconfigured")) return "worker_misconfigured";
  if (value.includes("fetcher_not_found")) return "fetcher_not_found (extractor sin registrar)";
  if (value.includes("phone_unavailable")) return "phone_unavailable (max attempts reached)";
  if (value.includes("captcha")) return "captcha";
  if (value.includes("bad_response")) return "worker_bad_response";
  if (value.includes("p2025") || value.includes("not found")) return "listing_not_found";
  return "otro";
}

// ---------------------------------------------------------------------------
// Section 5 — Cobertura agregada en MarketAdvertiser
// ---------------------------------------------------------------------------

interface AdvertiserCoverage {
  total: number;
  withPhoneCanonical: number;
  withoutPhoneCanonical: number;
  particular: number;
  agency: number;
  typeUnknown: number;
  linkedListings: number;
  unlinkedListings: number;
}

async function advertiserCoverage(prisma: PrismaClient): Promise<AdvertiserCoverage> {
  const [total, withPhone, particular, agency, typeUnknown, linkedListings, unlinkedListings] =
    await Promise.all([
      prisma.marketAdvertiser.count(),
      prisma.marketAdvertiser.count({ where: { phoneCanonical: { not: null } } }),
      prisma.marketAdvertiser.count({ where: { advertiserType: "particular" } }),
      prisma.marketAdvertiser.count({ where: { advertiserType: "agency" } }),
      prisma.marketAdvertiser.count({ where: { advertiserType: null } }),
      prisma.marketListing.count({ where: { advertiserId: { not: null } } }),
      prisma.marketListing.count({ where: { advertiserId: null } }),
    ]);
  return {
    total,
    withPhoneCanonical: withPhone,
    withoutPhoneCanonical: total - withPhone,
    particular,
    agency,
    typeUnknown,
    linkedListings,
    unlinkedListings,
  };
}

// ---------------------------------------------------------------------------
// Section 6 — Top portales por completitud + diagnóstico final
// ---------------------------------------------------------------------------

interface Diagnosis {
  likelyRootCauses: string[];
  recommendedActions: string[];
}

function diagnose(
  env: EnvCheck,
  workerHealth: WorkerHealthCheck,
  coverages: PortalCoverage[],
  jobs: FetchDetailJobsState,
  advertisers: AdvertiserCoverage,
): Diagnosis {
  const causes: string[] = [];
  const actions: string[] = [];

  const totalListings = coverages.reduce((acc, c) => acc + c.total, 0);
  const totalWithPhone = coverages.reduce((acc, c) => acc + c.withPhone, 0);

  // CAUSE 1: worker no configurado en el runtime actual
  if (!env.marketWorkerCanCall) {
    causes.push(
      "MARKET_WORKER_BASE_URL o MARKET_WORKER_SHARED_SECRET no están definidos en este runtime. " +
        "El handler `MARKET_FETCH_DETAIL` hace skip silencioso (success sin trabajo) " +
        "cuando estas vars faltan (`lib/market/jobs/fetch-detail-handler.ts:127-132`), " +
        "por lo que NINGÚN listing recibe nunca la llamada interactiva al portal.",
    );
    actions.push(
      "Definir MARKET_WORKER_BASE_URL y MARKET_WORKER_SHARED_SECRET en Vercel " +
        "(deben coincidir con WORKER_SHARED_SECRET del proceso Railway).",
    );
  } else if (workerHealth.attempted && !workerHealth.reachable) {
    causes.push(
      `El Market Worker en ${env.workerBaseUrl} no responde sano: ` +
        `${workerHealth.errorMessage ?? "sin detalle"}.`,
    );
    actions.push(
      "Verificar el deploy de market-worker en Railway. " +
        "GET /internal/health debe devolver { status: 'ok' | 'degraded' }.",
    );
  } else if (workerHealth.attempted && workerHealth.reachable) {
    // Métricas internas del worker (processed vs failed)
    const body = workerHealth.body as { processed?: number; failed?: number } | null;
    const processed = body?.processed ?? 0;
    const failed = body?.failed ?? 0;
    const failureRate = processed + failed > 0 ? failed / (processed + failed) : 0;
    if (failureRate > 0.3) {
      causes.push(
        `El worker reporta failed=${failed} vs processed=${processed} ` +
          `(failure rate ${(failureRate * 100).toFixed(1)}%). Más de 1 de cada 3 intentos del worker termina en error.`,
      );
      actions.push(
        "Revisar logs de Railway → market-worker filtrando por 'fallback' y 'blocked' " +
          "para identificar si el problema es PerimeterX, DataDome, timeout o captcha.",
      );
    }
  }

  // CAUSE 2: per-portal — listings con detailFetched=0 (jobs no llegaron al worker)
  for (const c of coverages) {
    if (c.total === 0) continue;
    const ratioAttemptsZero = c.attemptsZero / c.total;
    if (ratioAttemptsZero >= 0.5 && c.detailFetched < c.total / 2) {
      causes.push(
        `${c.label} tiene ${c.attemptsZero}/${c.total} listings (${pct(c.attemptsZero, c.total)}) ` +
          `con detailFetchAttempts=0. Esos jobs nunca tocaron el worker. ` +
          `Si los jobs aparecen como COMPLETED en la cola, fueron procesados antes de ` +
          `que MARKET_WORKER_BASE_URL/SHARED_SECRET estuvieran configurados en ese runtime ` +
          `(handler hace early-return 'success: true' sin trabajo). ` +
          `Si están en DEAD_LETTER, el cliente HTTP falló (network/timeout) antes de llegar al worker.`,
      );
    }
  }

  // CAUSE 3: jobs encolados pero fallando masivamente
  const failedCount = jobs.totalsByStatus.FAILED + jobs.totalsByStatus.DEAD_LETTER;
  if (jobs.totalAll > 0 && failedCount / jobs.totalAll > 0.1) {
    causes.push(
      `${failedCount}/${jobs.totalAll} jobs MARKET_FETCH_DETAIL están FAILED/DEAD_LETTER ` +
        `(${pct(failedCount, jobs.totalAll)}). Ver patrones de error abajo.`,
    );
    const topPattern = jobs.errorPatterns[0];
    if (topPattern) {
      actions.push(
        `Patrón dominante: "${topPattern.pattern}" (${topPattern.count} ocurrencias de ${failedCount} fallos). ` +
          `Investigar logs del worker (Railway → market-worker → logs) ` +
          `filtrando por las URLs de los listings DEAD_LETTER de la muestra de arriba.`,
      );
      if (topPattern.pattern.includes("network") || topPattern.pattern.includes("timeout")) {
        actions.push(
          "Como el patrón dominante es de conectividad: verificar si el worker en " +
            "Railway estaba caído, reciclando o saturado en la ventana de tiempo de los fallos. " +
            "Tras corregirlo, reencolar manualmente esos listings con un script ad-hoc " +
            "(borrar las filas DEAD_LETTER y volver a encolar con idempotencyKey nueva).",
        );
      }
    }
  }

  // CAUSE 4: per-portal — Fotocasa direct-browser bloqueado
  const fotocasa = coverages.find((c) => c.source === "source_a");
  if (
    fotocasa &&
    fotocasa.total > 0 &&
    fotocasa.detailFetched > 0 &&
    fotocasa.withPhone === 0 &&
    env.marketFotocasaUseBrightData !== "true"
  ) {
    causes.push(
      `Fotocasa: ${fotocasa.detailFetched}/${fotocasa.total} listings tienen detailFetched ` +
        `pero ${fotocasa.withPhone}/${fotocasa.total} tienen teléfono. ` +
        `MARKET_FOTOCASA_USE_BRIGHTDATA=${env.marketFotocasaUseBrightData}: sin Bright Data, ` +
        `el worker usa direct-browser y PerimeterX bloquea la página de detalle (ver server.ts:53-67). ` +
        `El job se marca como completado pero el HTML capturado no contiene phones.`,
    );
    actions.push(
      "Activar MARKET_FOTOCASA_USE_BRIGHTDATA=true en el Worker (Railway) y " +
        "garantizar BRIGHTDATA_API_TOKEN + BRIGHTDATA_WEB_UNLOCKER_ZONE válidos. " +
        "La zona Web Unlocker debe tener 'Manual expect elements' ON. " +
        "Después, reencolar MARKET_FETCH_DETAIL para los listings de Fotocasa.",
    );
  }

  // CAUSE 5: per-portal — Idealista no registrado o pre-config
  const idealista = coverages.find((c) => c.source === "source_d");
  if (idealista && idealista.total > 0 && idealista.withPhone === 0) {
    if (env.marketIdealistaEnabled !== "true") {
      causes.push(
        `Idealista (${idealista.total} listings) tiene 0 con teléfono y ` +
          `MARKET_IDEALISTA_ENABLED=${env.marketIdealistaEnabled}. ` +
          `El extractor de Idealista no se registra en el worker sin esta flag, ` +
          `por lo que el detail interactivo no se ejecuta.`,
      );
      actions.push(
        "Activar MARKET_IDEALISTA_ENABLED=true en el WORKER (Railway), garantizar " +
          "BRIGHTDATA_SCRAPING_BROWSER_URL + BRIGHTDATA_RESIDENTIAL_PROXY_URL completos, " +
          "y reencolar MARKET_FETCH_DETAIL para los 160 listings de Idealista.",
      );
    } else if (idealista.attemptsZero === idealista.total) {
      causes.push(
        `Idealista (${idealista.total} listings) tiene detailFetchAttempts=0 pero ` +
          `MARKET_IDEALISTA_ENABLED=true. Los jobs fueron procesados antes de que ` +
          `MARKET_WORKER_BASE_URL/SHARED_SECRET estuvieran configurados en el runtime de la cola, ` +
          `o el worker no tenía Idealista registrado (BRIGHTDATA_SCRAPING_BROWSER_URL faltante) ` +
          `cuando se ejecutaron, devolviendo FETCHER_NOT_FOUND.`,
      );
      actions.push(
        "Verificar que el WORKER (Railway, no Vercel) tiene definidas: " +
          "BRIGHTDATA_API_TOKEN, BRIGHTDATA_WEB_UNLOCKER_ZONE, BRIGHTDATA_SCRAPING_BROWSER_URL, " +
          "BRIGHTDATA_RESIDENTIAL_PROXY_URL y MARKET_IDEALISTA_ENABLED=true. " +
          "Confirmar en los logs de arranque del worker: '[market-worker] Idealista (source_d) habilitado'.",
      );
      actions.push(
        "Tras confirmar la config del worker, reencolar manualmente los 160 listings " +
          "(borrar primero los MARKET_FETCH_DETAIL COMPLETED existentes para que la " +
          "idempotencyKey deje pasar el nuevo job, o usar una idempotencyKey distinta).",
      );
    }
  }

  // CAUSE 6: phones extraidos pero advertisers sin resolver
  if (totalWithPhone > 0 && advertisers.withPhoneCanonical === 0) {
    causes.push(
      `Hay ${totalWithPhone} listings con teléfono pero MarketAdvertiser tiene 0 advertisers ` +
        `con phoneCanonical. Falta procesar MARKET_RESOLVE_ADVERTISER después del fetch.`,
    );
    actions.push(
      "Verificar que /api/cron/consumer está corriendo y procesando " +
        "MARKET_RESOLVE_ADVERTISER. Recordatorio: MARKET_* está excluido del consumer Railway " +
        "(types.ts:113), por lo que SOLO el cron Vercel los procesa.",
    );
  }

  // POSITIVE FINDING: si Pisos.com funciona bien, marcarlo
  const pisoscom = coverages.find((c) => c.source === "source_b");
  if (pisoscom && pisoscom.total > 0 && pisoscom.withPhone / pisoscom.total > 0.4) {
    causes.push(
      `Observación positiva: Pisos.com extrae teléfonos para ${pisoscom.withPhone}/${pisoscom.total} ` +
        `listings (${pct(pisoscom.withPhone, pisoscom.total)}). El pipeline base funciona para ese portal; ` +
        `el problema es específico de Fotocasa (sin Bright Data) e Idealista (config worker o histórica).`,
    );
  }

  if (causes.length === 0) {
    causes.push(
      "Ninguna causa raíz obvia detectada. Inspeccionar manualmente los " +
        "listings sin teléfono y los logs del worker.",
    );
  }

  return { likelyRootCauses: causes, recommendedActions: actions };
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function printReport(report: {
  env: EnvCheck;
  workerHealth: WorkerHealthCheck;
  coverages: PortalCoverage[];
  jobs: FetchDetailJobsState;
  advertisers: AdvertiserCoverage;
  diagnosis: Diagnosis;
  sourceFilter: MarketSource | null;
}): void {
  const { env, workerHealth, coverages, jobs, advertisers, diagnosis, sourceFilter } = report;
  const sep = "=".repeat(80);
  console.log(sep);
  console.log("AUDITORÍA DE ENRIQUECIMIENTO DE TELÉFONOS — Motor de Captación");
  if (sourceFilter) {
    console.log(`Filtro: source=${sourceFilter} (${SOURCE_LABEL[sourceFilter]})`);
  }
  console.log(sep);

  // --- Sección 1: env
  console.log("\n[1/5] Configuración del entorno");
  console.log("-".repeat(80));
  console.log(`  MARKET_WORKER_BASE_URL          : ${env.workerBaseUrl}`);
  console.log(`  MARKET_WORKER_SHARED_SECRET     : ${env.workerSecretPreview}`);
  console.log(`  MARKET_WORKER_REQUEST_TIMEOUT_MS: ${env.workerRequestTimeoutMs}`);
  console.log(`  MARKET_DETAIL_TIMEOUT_MS        : ${env.marketDetailTimeoutMs}`);
  console.log(`  MARKET_FEATURE_ENABLED          : ${env.marketFeatureEnabled}`);
  console.log(`  ENABLE_EXTERNAL_PORTFOLIO_SEARCH: ${env.enableExternalPortfolioSearch}`);
  console.log(`  MARKET_FOTOCASA_USE_BRIGHTDATA  : ${env.marketFotocasaUseBrightData}`);
  console.log(`  MARKET_IDEALISTA_ENABLED        : ${env.marketIdealistaEnabled}`);
  console.log(`  BRIGHTDATA_API_TOKEN            : ${env.brightDataApiTokenSet ? "(definida)" : "(no definida)"}`);
  console.log(`  BRIGHTDATA_WEB_UNLOCKER_ZONE    : ${env.brightDataWebUnlockerZone}`);
  console.log(`  BRIGHTDATA_FOTOCASA_..._ZONE    : ${env.brightDataFotocasaZone}`);
  console.log(`  BRIGHTDATA_RESIDENTIAL_PROXY_URL: ${env.brightDataResidentialProxyUrl}`);
  console.log(
    `  → Puede el backend hablar con el worker: ${env.marketWorkerCanCall ? "SÍ" : "NO (skip silencioso del handler)"}`,
  );

  // --- Sección 2: worker health
  console.log("\n[2/5] Health check del Market Worker");
  console.log("-".repeat(80));
  if (!workerHealth.attempted) {
    console.log(`  (skipped — ${workerHealth.errorMessage})`);
  } else if (workerHealth.reachable) {
    console.log(`  ✓ /internal/health responde sano (HTTP ${workerHealth.httpStatus}, latency=${workerHealth.latencyMs}ms)`);
    console.log(`  body: ${JSON.stringify(workerHealth.body)}`);
  } else {
    console.log(
      `  ✗ Worker NO responde sano (HTTP ${workerHealth.httpStatus ?? "—"}, latency=${workerHealth.latencyMs ?? "—"}ms)`,
    );
    console.log(`  error: ${workerHealth.errorMessage}`);
  }

  // --- Sección 3: portales
  console.log("\n[3/5] Cobertura en MarketListing por portal");
  console.log("-".repeat(80));
  if (coverages.length === 0) {
    console.log("  (sin listings en la DB para los filtros aplicados)");
  }
  for (const c of coverages) {
    console.log("");
    console.log(`  ${c.label} (${c.source}) — total=${c.total}`);
    console.log(`    con teléfono       : ${c.withPhone} (${pct(c.withPhone, c.total)})`);
    console.log(`    con descripción    : ${c.withDescription} (${pct(c.withDescription, c.total)})`);
    console.log(`    con imágenes       : ${c.withImages} (${pct(c.withImages, c.total)})`);
    console.log(`    con ref. anuncio   : ${c.withListingReference} (${pct(c.withListingReference, c.total)})`);
    console.log(`    con ref. catastral : ${c.withCadastralRef} (${pct(c.withCadastralRef, c.total)})`);
    console.log(`    detail fetched     : ${c.detailFetched} (${pct(c.detailFetched, c.total)})`);
    console.log(
      `    detailFetchAttempts: 0=${c.attemptsZero} · 1=${c.attemptsOne} · 2=${c.attemptsTwo} · ≥3=${c.attemptsThreePlus} (maxed=${c.attemptsMaxed})`,
    );
    console.log(
      `    advertiserType     : particular=${c.particularTotal} (${c.particularWithPhone} con phone) · agency=${c.agencyTotal} (${c.agencyWithPhone} con phone) · null=${c.advertiserTypeUnknown}`,
    );
    if (c.captacionLastErrorTop.length > 0) {
      console.log(`    captacionLastError :`);
      for (const e of c.captacionLastErrorTop) {
        console.log(`      - ${e.reason.padEnd(30)} ${e.count}`);
      }
    } else {
      console.log(`    captacionLastError : (sin errores marcados)`);
    }
    if (c.recentListingsWithoutPhone.length > 0) {
      console.log(`    muestra reciente sin teléfono (${c.recentListingsWithoutPhone.length}):`);
      for (const l of c.recentListingsWithoutPhone) {
        console.log(
          `      • ${l.id}  type=${l.advertiserType ?? "—"}  attempts=${l.detailFetchAttempts}` +
            `  fetchedAt=${l.detailFetchedAt?.toISOString() ?? "—"}  err=${l.captacionLastError ?? "—"}`,
        );
        console.log(`        ${l.canonicalUrl}`);
      }
    }
  }

  // --- Sección 4: job queue
  console.log("\n[4/5] Estado de la cola MARKET_FETCH_DETAIL");
  console.log("-".repeat(80));
  console.log(`  total jobs: ${jobs.totalAll}`);
  for (const [status, count] of Object.entries(jobs.totalsByStatus)) {
    if (count > 0) {
      console.log(`    ${status.padEnd(12)} ${count}`);
    }
  }
  if (jobs.errorPatterns.length > 0) {
    console.log("\n  patrones de error (últimos 500 jobs FAILED/DEAD_LETTER):");
    for (const p of jobs.errorPatterns) {
      console.log(`    - ${p.pattern.padEnd(45)} ${p.count}`);
    }
  }
  if (jobs.recentFailed.length > 0) {
    console.log(`\n  últimos ${jobs.recentFailed.length} jobs FAILED/DEAD_LETTER (≤ ${jobs.failedSinceHours}h):`);
    for (const j of jobs.recentFailed) {
      console.log(
        `    • ${j.id} listing=${j.listingId ?? "—"} attempts=${j.attempts} at=${j.failedAt?.toISOString() ?? "—"}`,
      );
      console.log(`        ${j.lastError}`);
    }
  }

  // --- Sección 5: advertisers
  console.log("\n[5/5] Cobertura agregada en MarketAdvertiser");
  console.log("-".repeat(80));
  console.log(`  total advertisers          : ${advertisers.total}`);
  console.log(
    `  con phoneCanonical         : ${advertisers.withPhoneCanonical} (${pct(advertisers.withPhoneCanonical, advertisers.total)})`,
  );
  console.log(`  sin phoneCanonical         : ${advertisers.withoutPhoneCanonical}`);
  console.log(`  particular / agency / null : ${advertisers.particular} / ${advertisers.agency} / ${advertisers.typeUnknown}`);
  console.log(
    `  listings con advertiserId  : ${advertisers.linkedListings} (sin link: ${advertisers.unlinkedListings})`,
  );

  // --- Diagnóstico
  console.log("\n" + sep);
  console.log("DIAGNÓSTICO");
  console.log(sep);
  console.log("\nCausas raíz probables:");
  for (const c of diagnosis.likelyRootCauses) {
    console.log(`  • ${c}`);
  }
  if (diagnosis.recommendedActions.length > 0) {
    console.log("\nAcciones recomendadas (en orden):");
    for (const a of diagnosis.recommendedActions) {
      console.log(`  → ${a}`);
    }
  }
  console.log("");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { sourceFilter, jsonOutput } = parseArgs();
  const prisma = new PrismaClient();
  try {
    const env = inspectEnv();
    const workerHealth = await pingWorker(env);

    const sources = sourceFilter ? [sourceFilter] : ALL_SOURCES;
    const coverages: PortalCoverage[] = [];
    for (const source of sources) {
      const c = await coverageBySource(prisma, source);
      if (c) coverages.push(c);
    }

    const jobs = await fetchDetailJobsState(prisma);
    const advertisers = await advertiserCoverage(prisma);
    const diagnosis = diagnose(env, workerHealth, coverages, jobs, advertisers);

    if (jsonOutput) {
      console.log(
        JSON.stringify(
          {
            env,
            workerHealth,
            coverages,
            jobs,
            advertisers,
            diagnosis,
            sourceFilter,
          },
          null,
          2,
        ),
      );
    } else {
      printReport({
        env,
        workerHealth,
        coverages,
        jobs,
        advertisers,
        diagnosis,
        sourceFilter,
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[diagnose-market-phone-enrichment] fatal:", err);
  process.exit(1);
});
