export type UnlockUrlOptions = {
  url: string;
  zone: string;
  apiToken: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  format?: "raw" | "json";
  method?: "GET" | "POST";
  body?: string;
  country?: string;
  /**
   * Headers extra que se pasan en el body como `headers: {...}` y los
   * propaga el Web Unlocker como overrides per-request. Útil sobre todo
   * para `x-unblock-expect` (override del `expect_element` configurado
   * en la zona): por ejemplo, una zona configurada para Idealista con
   * `expect_element=.re-SharedTopbar` se puede reutilizar para Fotocasa
   * pasando `{ "x-unblock-expect": "{\"element\":\"body\"}" }`.
   *
   * Requiere que la zona tenga "Manual 'expect' elements" habilitado en
   * el dashboard (Configuration → Advanced settings → Custom Web Unlocker).
   * Sin ese toggle, Bright Data devuelve 400 con
   * `feature_not_active: Manual expect is not enabled for this zone`.
   */
  extraHeaders?: Record<string, string>;
};

/**
 * Razón de bloqueo cuando el cuerpo o el status delatan anti-bot del sitio
 * destino (no de Bright Data). Distinguir esto de errores de la API permite
 * al chain de fetchers caer al fallback en vez de abortar con HTTP_ERROR.
 */
export type UnlockBlockedReason =
  | "http_401"
  | "http_403"
  | "http_429"
  | "datadome"
  | "uso_indebido"
  | "captcha";

export type UnlockUrlResult = {
  ok: true;
  status: number;
  html: string;
  finalUrl?: string;
  contentType?: string;
  /**
   * `true` si Bright Data devolvió HTML pero el sitio destino devolvió
   * 401/403/429 o el HTML contiene marcadores DataDome/uso indebido.
   * Aunque `ok=true` (la API funcionó), el HTML no es utilizable.
   */
  blocked?: boolean;
  blockedReason?: UnlockBlockedReason;
};

export type UnlockUrlError = {
  ok: false;
  status?: number;
  errorCode?: string;
  errorMessage: string;
};

export type UnlockUrlOutcome = UnlockUrlResult | UnlockUrlError;

/**
 * Marcadores que SOLO aparecen en páginas de bloqueo reales (Idealista
 * sirve `dd.idealista.com/tags.js` y `recaptcha` en TODAS sus páginas
 * normales como defensa pasiva, así que no podemos usar esos como señal).
 *
 * Las heurísticas siguen este orden:
 *  1. Mensaje literal de Idealista cuando bloquea ("uso indebido").
 *  2. Página de captcha de DataDome servida en lugar del contenido
 *     (path `/captcha/` o `/c/captcha`, no solo el host).
 *  3. HTML muy corto (< 30 KB) **y** con marcadores genéricos de
 *     DataDome/captcha — los listados reales pesan > 200 KB.
 */
const BLOCK_HARD_PATTERNS: Array<{ regex: RegExp; reason: UnlockBlockedReason }> = [
  { regex: /hemos detectado un uso (?:indebido|inadecuado)|uso indebido de la aplicaci[oó]n/i, reason: "uso_indebido" },
  // Página de bloqueo real de DataDome contra Idealista (muestreado el
  // 06/05/2026 con `curl -A "curl/8.0"`):
  //   - Body con `var dd={'rt':'c'...'host':'geo.captcha-delivery.com'...}`
  //   - Script `ct.captcha-delivery.com/c.js`
  //   - Mensaje "Please enable JS and disable any ad blocker"
  // Excluimos `dd.idealista.com/tags.js` porque ese tag defensivo va en
  // cada página normal de Idealista (incluso las que devuelven listings OK).
  {
    regex: /(?:ct|geo)\.captcha-delivery\.com\/(?:c\.js|captcha\/)|please enable js and disable any ad blocker|var\s+dd\s*=\s*\{[^}]*['"]rt['"]\s*:\s*['"]c['"]/i,
    reason: "datadome",
  },
  // Páginas específicas "Acceso denegado" / "Forbidden" servidas en lugar
  // del listado.
  { regex: /<title>[^<]*(?:acceso (?:denegado|restringido)|access denied|forbidden)[^<]*<\/title>/i, reason: "datadome" },
];

const BLOCK_SHORT_HTML_THRESHOLD = 30_000;
const BLOCK_SHORT_HTML_PATTERN = /captcha|datadome|verifica que eres humano|verify you are human|are you a robot/i;

function detectBlockedFromHtml(html: string): UnlockBlockedReason | null {
  if (!html || html.length === 0) return null;
  for (const { regex, reason } of BLOCK_HARD_PATTERNS) {
    if (regex.test(html)) return reason;
  }
  // HTML muy corto + cualquier marcador defensivo => probablemente bloqueo.
  // Páginas reales de listado de Idealista pesan ~370 KB; bloqueos < 20 KB.
  if (html.length < BLOCK_SHORT_HTML_THRESHOLD && BLOCK_SHORT_HTML_PATTERN.test(html)) {
    return "captcha";
  }
  return null;
}

function detectBlockedFromStatus(status: number): UnlockBlockedReason | null {
  if (status === 401) return "http_401";
  if (status === 403) return "http_403";
  if (status === 429) return "http_429";
  return null;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_BASE_URL = "https://api.brightdata.com";

type ApiErrorPayload = {
  error?: string | { code?: string; message?: string };
  message?: string;
};

function describeError(payload: unknown): { code?: string; message: string } | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const typed = payload as ApiErrorPayload;
  if (typeof typed.error === "string") return { message: typed.error };
  if (typed.error && typeof typed.error === "object") {
    return {
      code: typed.error.code,
      message: typed.error.message ?? "Unknown Web Unlocker error",
    };
  }
  if (typed.message) return { message: typed.message };
  return undefined;
}

export async function unlockUrl(options: UnlockUrlOptions): Promise<UnlockUrlOutcome> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const requestBody: Record<string, unknown> = {
    zone: options.zone,
    url: options.url,
    format: options.format ?? "raw",
  };
  if (options.method) requestBody.method = options.method;
  if (options.body) requestBody.body = options.body;
  if (options.country) requestBody.country = options.country;
  if (options.extraHeaders && Object.keys(options.extraHeaders).length > 0) {
    requestBody.headers = options.extraHeaders;
  }

  try {
    const response = await fetchImpl(`${baseUrl}/request`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiToken}`,
        "Content-Type": "application/json",
        Accept: "*/*",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      let code: string | undefined;
      let message = `HTTP ${response.status} ${response.statusText}`;
      try {
        const text = await response.text();
        try {
          const parsed = JSON.parse(text) as unknown;
          const described = describeError(parsed);
          if (described) {
            code = described.code;
            message = described.message;
          } else if (text) {
            message = text.slice(0, 240);
          }
        } catch {
          if (text) message = text.slice(0, 240);
        }
      } catch {
        // ignore body read errors, we still report the status
      }
      return {
        ok: false,
        status: response.status,
        errorCode: code,
        errorMessage: message,
      };
    }

    const finalUrl = response.headers.get("x-final-url") ?? undefined;
    const contentType = response.headers.get("content-type") ?? undefined;
    const html = await response.text();
    // Status real del sitio destino. Bright Data lo expone en `x-final-status`
    // o, en su defecto, lo refleja en el `response.status` (cuando el body es
    // solo un mensaje de error del sitio). Probamos ambos.
    const finalStatusHeader = response.headers.get("x-final-status");
    const finalStatus = finalStatusHeader ? Number(finalStatusHeader) : response.status;
    const blockedFromStatus = Number.isFinite(finalStatus)
      ? detectBlockedFromStatus(finalStatus as number)
      : null;
    const blockedFromHtml = blockedFromStatus ? null : detectBlockedFromHtml(html);
    const blockedReason = blockedFromStatus ?? blockedFromHtml ?? undefined;
    return {
      ok: true,
      status: response.status,
      html,
      finalUrl,
      contentType,
      blocked: Boolean(blockedReason),
      blockedReason,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      errorMessage: message,
    };
  } finally {
    clearTimeout(timer);
  }
}
