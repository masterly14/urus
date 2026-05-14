export type StatefoxImageWorkerMode = "local" | "railway" | "hybrid";

export type StatefoxImageImportConfig = {
  enabled: boolean;
  syncOnFirstSeen: boolean;
  syncMaxComparables: number;
  maxImages: number;
  timeoutMs: number;
  idealistaDelayMs: number;
  headless: boolean;
  storageStatePath?: string;
  workerMode: StatefoxImageWorkerMode;
  workerBaseUrl?: string;
  workerSecret?: string;
  /** Ventana síncrona (ms) que la API espera al worker antes de degradar a async. */
  workerSyncDeadlineMs: number;
  /** Timeout HTTP del request al worker (un poco mayor que el deadline lógico). */
  workerRequestTimeoutMs: number;
  brightDataUrl?: string;
  brightDataResidentialProxyUrl?: string;
  brightDataResidentialProxyUsername?: string;
  brightDataResidentialProxyPassword?: string;
  brightDataResidentialProxySession?: string;
  brightDataConnectTimeoutMs: number;
  brightDataNetworkIdleTimeoutMs: number;
  brightDataCaptchaDetectTimeoutMs: number;
  brightDataCaptchaSolve: boolean;
  brightDataApiToken?: string;
  brightDataSessionInspectEnabled: boolean;
  webUnlockerEnabled: boolean;
  webUnlockerZone?: string;
  webUnlockerCountry?: string;
  webUnlockerTimeoutMs: number;
  idealistaDirectCdpEnabled: boolean;
  warmSessionEnabled: boolean;
  warmSessionRequireCdp: boolean;
  warmSessionTtlMs: number;
  warmSessionMaxRequests: number;
  humanBehaviorEnabled: boolean;
  warmupNavigationEnabled: boolean;
};

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function envBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  return ["1", "true", "yes", "si", "sí"].includes(raw.trim().toLowerCase());
}

function envWorkerMode(fallback: StatefoxImageWorkerMode): StatefoxImageWorkerMode {
  const raw = process.env.STATEFOX_IMAGE_WORKER_MODE?.trim().toLowerCase();
  if (raw === "local" || raw === "railway" || raw === "hybrid") return raw;
  return fallback;
}

export function getStatefoxImageImportConfig(): StatefoxImageImportConfig {
  const defaultEnabled = process.env.NODE_ENV !== "test";
  const brightDataUrl = process.env.BRIGHTDATA_SCRAPING_BROWSER_URL?.trim() || undefined;
  const brightDataResidentialProxyUrl =
    process.env.BRIGHTDATA_RESIDENTIAL_PROXY_URL?.trim() || undefined;
  const brightDataResidentialProxyUsername =
    process.env.BRIGHTDATA_RESIDENTIAL_PROXY_USERNAME?.trim() || undefined;
  const brightDataResidentialProxyPassword =
    process.env.BRIGHTDATA_RESIDENTIAL_PROXY_PASSWORD?.trim() || undefined;
  const brightDataResidentialProxySession =
    process.env.BRIGHTDATA_RESIDENTIAL_PROXY_SESSION?.trim() || undefined;
  return {
    enabled: envBoolean("STATEFOX_IMAGE_IMPORT_ENABLED", defaultEnabled),
    syncOnFirstSeen: envBoolean("STATEFOX_IMAGE_IMPORT_SYNC_ON_FIRST_SEEN", true),
    syncMaxComparables: Math.max(0, envNumber("STATEFOX_IMAGE_IMPORT_SYNC_MAX_COMPARABLES", 5)),
    maxImages: Math.max(1, envNumber("STATEFOX_IMAGE_IMPORT_MAX_IMAGES", 12)),
    timeoutMs: Math.max(5_000, envNumber("STATEFOX_IMAGE_IMPORT_TIMEOUT_MS", 60_000)),
    idealistaDelayMs: envNumber("IDEALISTA_IMAGE_IMPORT_DELAY_MS", 3_000),
    headless: envBoolean("IDEALISTA_HEADLESS", true),
    storageStatePath: process.env.IDEALISTA_STORAGE_STATE?.trim() || undefined,
    workerMode: envWorkerMode(
      process.env.STATEFOX_IMAGE_WORKER_URL?.trim() ? "hybrid" : "local",
    ),
    workerBaseUrl: process.env.STATEFOX_IMAGE_WORKER_URL?.trim() || undefined,
    workerSecret: process.env.STATEFOX_IMAGE_WORKER_SECRET?.trim() || undefined,
    workerSyncDeadlineMs: Math.max(
      500,
      envNumber("STATEFOX_IMAGE_WORKER_SYNC_DEADLINE_MS", 3_000),
    ),
    workerRequestTimeoutMs: Math.max(
      1_000,
      envNumber("STATEFOX_IMAGE_WORKER_REQUEST_TIMEOUT_MS", 4_500),
    ),
    brightDataUrl,
    brightDataResidentialProxyUrl,
    brightDataResidentialProxyUsername,
    brightDataResidentialProxyPassword,
    brightDataResidentialProxySession,
    brightDataConnectTimeoutMs: Math.max(
      5_000,
      envNumber("BRIGHTDATA_CDP_CONNECT_TIMEOUT_MS", 120_000),
    ),
    brightDataNetworkIdleTimeoutMs: Math.max(
      1_000,
      envNumber("BRIGHTDATA_NETWORKIDLE_TIMEOUT_MS", 25_000),
    ),
    brightDataCaptchaDetectTimeoutMs: Math.max(
      1_000,
      envNumber("BRIGHTDATA_CAPTCHA_DETECT_TIMEOUT_MS", 20_000),
    ),
    brightDataCaptchaSolve: envBoolean(
      "BRIGHTDATA_CAPTCHA_SOLVE_ENABLED",
      Boolean(brightDataUrl),
    ),
    brightDataApiToken: process.env.BRIGHTDATA_API_TOKEN?.trim() || undefined,
    brightDataSessionInspectEnabled: envBoolean(
      "BRIGHTDATA_SESSION_INSPECT_ENABLED",
      Boolean(process.env.BRIGHTDATA_API_TOKEN?.trim()),
    ),
    webUnlockerZone: process.env.BRIGHTDATA_WEB_UNLOCKER_ZONE?.trim() || undefined,
    webUnlockerEnabled: envBoolean(
      "BRIGHTDATA_WEB_UNLOCKER_ENABLED",
      Boolean(
        process.env.BRIGHTDATA_API_TOKEN?.trim() &&
          process.env.BRIGHTDATA_WEB_UNLOCKER_ZONE?.trim(),
      ),
    ),
    webUnlockerCountry: process.env.BRIGHTDATA_WEB_UNLOCKER_COUNTRY?.trim() || undefined,
    webUnlockerTimeoutMs: Math.max(
      5_000,
      envNumber("BRIGHTDATA_WEB_UNLOCKER_TIMEOUT_MS", 90_000),
    ),
    idealistaDirectCdpEnabled: envBoolean(
      "STATEFOX_IDEALISTA_DIRECT_CDP_ENABLED",
      Boolean(brightDataUrl),
    ),
    warmSessionEnabled: envBoolean("STATEFOX_WARM_SESSION_ENABLED", true),
    warmSessionRequireCdp: envBoolean("STATEFOX_WARM_SESSION_REQUIRE_CDP", true),
    warmSessionTtlMs: Math.max(
      1_000,
      envNumber("STATEFOX_WARM_SESSION_TTL_MS", 4 * 60 * 60 * 1000),
    ),
    warmSessionMaxRequests: Math.max(1, envNumber("STATEFOX_WARM_SESSION_MAX_REQUESTS", 40)),
    humanBehaviorEnabled: envBoolean("STATEFOX_HUMAN_BEHAVIOR_ENABLED", true),
    warmupNavigationEnabled: envBoolean("STATEFOX_WARMUP_NAVIGATION_ENABLED", true),
  };
}
