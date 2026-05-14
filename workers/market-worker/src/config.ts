/**
 * Configuración del Worker leída desde env.
 *
 * Falla rápido si falta algo crítico (`WORKER_SHARED_SECRET`,
 * `DATABASE_URL`). El resto tiene defaults razonables documentados en
 * `.env.example`.
 */

export interface WorkerConfig {
  port: number;
  sharedSecret: string;
  databaseUrl: string;
  maxConcurrentBrowsers: number;
  defaultBudgetMs: number;
  defaultBudgetRequests: number;
  defaultDeadlineMs: number;
  politeDelayMs: number;
  logLevel: string;
  playwrightHeadless: boolean;
  version: string;
  /**
   * Bloque Idealista (Fase 2.c). Si `enabled=false`, el server no
   * registra el extractor `source_d` en el Map y los crons del Core
   * pueden encolar Fotocasa/Pisos.com sin que llegue trafico Idealista
   * al Worker. Activacion progresiva: ver runbook §11 + decisiones.md §11.
   */
  idealista: {
    enabled: boolean;
    brightDataApiToken?: string;
    webUnlockerZone?: string;
    webUnlockerCountry?: string;
    webUnlockerTimeoutMs?: number;
    brightDataScrapingBrowserUrl?: string;
    residentialProxyUrl?: string;
    residentialProxyUsername?: string;
    residentialProxyPassword?: string;
    residentialProxySession?: string;
    warmSessionTtlMs: number;
    warmSessionMaxRequests: number;
  };
  /**
   * Bloque Fotocasa Bright Data (mayo 2026). Si `useBrightData=false`,
   * Fotocasa sigue usando `direct-browser` (pag.1 sin autenticar) y el
   * detail queda bloqueado por PerimeterX. Cuando `useBrightData=true`
   * el server cablea `createWebUnlockerFetcher` con el header
   * `x-unblock-expect={"element":"body"}` para reutilizar la MISMA zona
   * Bright Data de Idealista (`web_unlocker1`).
   *
   * Por qué reutilizar la zona:
   *   - La zona de Idealista tiene `expect_element=.re-SharedTopbar` configurado
   *     a nivel de zona; ese selector NO existe en Fotocasa y produce 502.
   *   - Pasando el header `x-unblock-expect: {"element":"body"}` por request,
   *     Bright Data sobreescribe el selector solo para esa llamada (requiere
   *     que la zona tenga "Manual 'expect' elements" activado en el dashboard).
   *   - Verificado el 7/05/2026: `web_unlocker1` con ese header devuelve 1.5MB
   *     de HTML real de Fotocasa con `__INITIAL_PROPS__` completo (descripción,
   *     teléfonos, fotos, sin necesidad de click "Ver teléfono").
   *
   * Si `webUnlockerZone` está vacío se reusa el de Idealista (`BRIGHTDATA_WEB_UNLOCKER_ZONE`).
   */
  fotocasa: {
    useBrightData: boolean;
    webUnlockerZone?: string;
    webUnlockerCountry?: string;
    webUnlockerTimeoutMs?: number;
    /**
     * Selector CSS que Bright Data debe esperar antes de retornar el HTML.
     * Default: "body" (cualquier render). Permite ajustar si se quiere
     * forzar carga completa de un elemento Fotocasa-específico.
     */
    expectElement: string;
    /** Tope duro de paginas/run cuando useBrightData=true (default 5). */
    maxPages: number;
    /** Pausa entre paginas (ms) para Web Unlocker (default 4s). */
    politeDelayMs: number;
  };
}

function num(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw || raw.trim() === "") return defaultValue;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Variable de entorno ${name} no es un número válido: ${raw}`);
  }
  return parsed;
}

function bool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw === "") return defaultValue;
  return raw === "true" || raw === "1" || raw === "yes";
}

export function loadWorkerConfig(): WorkerConfig {
  const sharedSecret = process.env.WORKER_SHARED_SECRET?.trim() ?? "";
  if (!sharedSecret) {
    throw new Error("WORKER_SHARED_SECRET es obligatorio");
  }
  const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (!databaseUrl) {
    throw new Error("DATABASE_URL es obligatorio");
  }

  const idealistaEnabled = bool("MARKET_IDEALISTA_ENABLED", false);

  return {
    port: num("WORKER_PORT", 8080),
    sharedSecret,
    databaseUrl,
    // Subido a 4 con la implementacion de detail interactivo (click "Ver
    // telefono"): cada captura cuesta ~30-45s con browser abierto. Con 4
    // en paralelo procesa ~250 jobs/30 min. Ajustar a 2 si hay OOM en
    // Railway plan basico.
    maxConcurrentBrowsers: num("MAX_CONCURRENT_BROWSERS", 4),
    defaultBudgetMs: num("DEFAULT_BUDGET_MS", 60_000),
    defaultBudgetRequests: num("DEFAULT_BUDGET_REQUESTS", 50),
    defaultDeadlineMs: num("DEFAULT_DEADLINE_MS", 8_000),
    politeDelayMs: num("POLITE_DELAY_MS", 2_500),
    logLevel: process.env.LOG_LEVEL?.trim() || "info",
    playwrightHeadless: bool("PLAYWRIGHT_HEADLESS", true),
    version: process.env.WORKER_VERSION?.trim() || "dev",
    idealista: {
      enabled: idealistaEnabled,
      brightDataApiToken: process.env.BRIGHTDATA_API_TOKEN?.trim() || undefined,
      webUnlockerZone: process.env.BRIGHTDATA_WEB_UNLOCKER_ZONE?.trim() || undefined,
      webUnlockerCountry:
        process.env.BRIGHTDATA_WEB_UNLOCKER_COUNTRY?.trim() || "es",
      webUnlockerTimeoutMs: num("BRIGHTDATA_WEB_UNLOCKER_TIMEOUT_MS", 90_000),
      brightDataScrapingBrowserUrl:
        process.env.BRIGHTDATA_SCRAPING_BROWSER_URL?.trim() || undefined,
      residentialProxyUrl:
        process.env.BRIGHTDATA_RESIDENTIAL_PROXY_URL?.trim() || undefined,
      residentialProxyUsername:
        process.env.BRIGHTDATA_RESIDENTIAL_PROXY_USERNAME?.trim() || undefined,
      residentialProxyPassword:
        process.env.BRIGHTDATA_RESIDENTIAL_PROXY_PASSWORD?.trim() || undefined,
      residentialProxySession:
        process.env.BRIGHTDATA_RESIDENTIAL_PROXY_SESSION?.trim() || undefined,
      warmSessionTtlMs: num("STATEFOX_WARM_SESSION_TTL_MS", 4 * 60 * 60 * 1000),
      warmSessionMaxRequests: num("STATEFOX_WARM_SESSION_MAX_REQUESTS", 40),
    },
    fotocasa: {
      useBrightData: bool("MARKET_FOTOCASA_USE_BRIGHTDATA", false),
      // Zona Bright Data para Fotocasa. Si vacía, reusa la zona de Idealista
      // (que ya está configurada con "Manual 'expect' elements" habilitado y
      // soporta override per-request via header `x-unblock-expect`).
      webUnlockerZone:
        process.env.BRIGHTDATA_FOTOCASA_WEB_UNLOCKER_ZONE?.trim() ||
        process.env.BRIGHTDATA_WEB_UNLOCKER_ZONE?.trim() ||
        undefined,
      webUnlockerCountry:
        process.env.BRIGHTDATA_FOTOCASA_WEB_UNLOCKER_COUNTRY?.trim() ||
        process.env.BRIGHTDATA_WEB_UNLOCKER_COUNTRY?.trim() ||
        "es",
      webUnlockerTimeoutMs: num(
        "BRIGHTDATA_FOTOCASA_WEB_UNLOCKER_TIMEOUT_MS",
        num("BRIGHTDATA_WEB_UNLOCKER_TIMEOUT_MS", 90_000),
      ),
      // Default "body" funciona porque la zona acepta override per-request.
      // Si Fotocasa tarda en hidratar y devuelve HTML sin `__INITIAL_PROPS__`,
      // se puede subir a un selector más específico (ej. `.re-DetailHeader`).
      expectElement:
        process.env.MARKET_FOTOCASA_EXPECT_ELEMENT?.trim() || "body",
      maxPages: num("MARKET_FOTOCASA_MAX_PAGES", 5),
      politeDelayMs: num("MARKET_FOTOCASA_POLITE_DELAY_MS", 4_000),
    },
  };
}
