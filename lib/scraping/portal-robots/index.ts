/**
 * Lector y evaluador de robots.txt común a múltiples portales.
 *
 * Reemplaza la duplicación de `lib/fotocasa/robots.ts` y
 * `lib/idealista/robots.ts` por una pequeña capa parametrizable que
 * usan los nuevos portales del Core (Pisos.com, Milanuncios) y el
 * script de captura `scripts/capture-portal-html.ts`.
 *
 * Diseño:
 *  - Sin estado global. `parseRobotsTxt` y `evaluateRobots` son puros.
 *  - `fetchPortalRobots` recibe `{ host, userAgent }` y devuelve la
 *    `RobotsPolicy` parseada.
 *  - Las funciones siguen el mismo contrato que los antiguos archivos
 *    por portal, así que su uso es trivial desde código nuevo y los
 *    archivos legacy pueden seguir existiendo sin conflicto.
 */

export type RobotsDirective = "allow" | "disallow";

export interface RobotsRule {
  directive: RobotsDirective;
  pattern: string;
}

export interface RobotsPolicy {
  rules: RobotsRule[];
  /**
   * `true` cuando se cargó robots.txt vía HTTP (200) y se parseó.
   * `false` cuando no se pudo descargar y el caller pidió tolerar (modo
   * permisivo). El caller decide qué hacer con políticas no verificadas.
   */
  verified: boolean;
}

function normalizeLine(line: string): string {
  const hashIndex = line.indexOf("#");
  return (hashIndex >= 0 ? line.slice(0, hashIndex) : line).trim();
}

export function parseRobotsTxt(content: string, userAgent = "*"): RobotsPolicy {
  const rules: RobotsRule[] = [];
  let currentAgents: string[] = [];
  let groupApplies = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = normalizeLine(rawLine);
    if (!line) {
      currentAgents = [];
      groupApplies = false;
      continue;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 0) continue;

    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();

    if (key === "user-agent") {
      const agent = value.toLowerCase();
      currentAgents.push(agent);
      groupApplies =
        currentAgents.includes("*") ||
        currentAgents.some((candidate) => userAgent.toLowerCase().includes(candidate));
      continue;
    }

    if (!groupApplies) continue;
    if (key !== "allow" && key !== "disallow") continue;
    if (value === "") continue;

    rules.push({ directive: key as RobotsDirective, pattern: value });
  }

  return { rules, verified: true };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

export function robotsPatternMatches(pattern: string, pathWithSearch: string): boolean {
  if (pattern === "/") return pathWithSearch.startsWith("/");

  const anchoredAtEnd = pattern.endsWith("$");
  const body = anchoredAtEnd ? pattern.slice(0, -1) : pattern;
  const regex = new RegExp(
    `^${body
      .split("*")
      .map(escapeRegExp)
      .join(".*")}${anchoredAtEnd ? "$" : ""}`,
  );
  return regex.test(pathWithSearch);
}

export interface RobotsDecision {
  allowed: boolean;
  matchedRule?: string;
  matchedDirective?: RobotsDirective;
}

export function evaluateRobots(policy: RobotsPolicy, url: string): RobotsDecision {
  // Si la política no fue verificada (no se pudo descargar el robots.txt
  // y el caller eligió continuar) se considera permisiva: el extractor
  // y/o circuit breaker manejará bloqueos posteriores.
  if (!policy.verified) return { allowed: true };

  const parsed = new URL(url);
  const pathWithSearch = `${parsed.pathname}${parsed.search}`;

  let matched: RobotsRule | undefined;
  for (const rule of policy.rules) {
    if (!robotsPatternMatches(rule.pattern, pathWithSearch)) continue;
    if (!matched || rule.pattern.length > matched.pattern.length) {
      matched = rule;
    } else if (
      matched &&
      rule.pattern.length === matched.pattern.length &&
      rule.directive === "allow"
    ) {
      matched = rule;
    }
  }

  if (!matched) return { allowed: true };
  return {
    allowed: matched.directive === "allow",
    matchedRule: matched.pattern,
    matchedDirective: matched.directive,
  };
}

export interface FetchPortalRobotsOptions {
  /** Host del portal sin esquema. Ej: `www.pisos.com`. */
  host: string;
  /** User-Agent que se anuncia y para el que se filtran reglas. */
  userAgent: string;
  /**
   * Si `true`, los errores HTTP NO lanzan: devuelve `{ rules: [], verified: false }`
   * para que el caller decida (útil para portales que ocasionalmente
   * devuelven 5xx/403 en su robots).
   */
  allowUnverified?: boolean;
  /** Inyectable para tests. */
  fetchImpl?: typeof fetch;
}

export async function fetchPortalRobots(
  options: FetchPortalRobotsOptions,
): Promise<RobotsPolicy> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = `https://${options.host}/robots.txt`;
  const response = await fetchImpl(url, {
    headers: {
      "User-Agent": options.userAgent,
      Accept: "text/plain,text/html,*/*",
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    },
  }).catch((err: unknown) => {
    if (options.allowUnverified) return null;
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`No se pudo descargar robots.txt de ${options.host}: ${message}`);
  });

  if (!response) return { rules: [], verified: false };
  if (!response.ok) {
    if (options.allowUnverified) return { rules: [], verified: false };
    throw new Error(
      `No se pudo descargar robots.txt de ${options.host}: HTTP ${response.status}`,
    );
  }
  return parseRobotsTxt(await response.text(), options.userAgent);
}
