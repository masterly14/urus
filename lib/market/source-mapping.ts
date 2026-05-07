/**
 * Mapping entre los slugs genéricos del enum Prisma `MarketSource`
 * (`source_a`, `source_b`, `source_c`, `source_d`) y los nombres reales
 * de los portales inmobiliarios.
 *
 * Decisión arquitectónica: el schema usa nombres genéricos para no acoplar
 * la base de datos a los nombres comerciales (que pueden cambiar, ser
 * renombrados, fusionarse o renegociarse). El mapping vive en código y
 * es la única fuente de verdad para presentación, logging y configuración
 * por portal.
 *
 * Asignaciones V1 (ver docs/core-sistema-mercado-decisiones.md §2):
 *   source_a = fotocasa     (Fase 2.a + 2.b — activo en MVP)
 *   source_b = pisoscom     (Fase 2.b — activo en MVP)
 *   source_c = milanuncios  (fuera de MVP — bloqueado por PerimeterX/HUMAN,
 *                            requiere Bright Data Web Unlocker; ver
 *                            docs/portal-html-analysis.md y
 *                            docs/core-mvp-status.md)
 *   source_d = idealista    (Fase 2.c — fuera de MVP, requiere Bright Data)
 *
 * Mantenemos las constantes y el mapping de Milanuncios e Idealista para no
 * romper datos históricos ni futuras reactivaciones, pero NINGÚN cron ni
 * registro de extractor del worker debe ejecutarse contra ellos hasta que
 * `ACTIVE_PORTALS_V1` los incluya explícitamente.
 */

import type { MarketSource } from "./types";

/** Nombres canónicos de portal expuestos en logs, métricas y UI interna. */
export type PortalSlug =
  | "fotocasa"
  | "pisoscom"
  | "milanuncios"
  | "idealista"
  | "unknown";

const SOURCE_TO_PORTAL: Record<MarketSource, PortalSlug> = {
  source_a: "fotocasa",
  source_b: "pisoscom",
  source_c: "milanuncios",
  source_d: "idealista",
  unknown: "unknown",
};

const PORTAL_TO_SOURCE: Record<PortalSlug, MarketSource> = {
  fotocasa: "source_a",
  pisoscom: "source_b",
  milanuncios: "source_c",
  idealista: "source_d",
  unknown: "unknown",
};

/**
 * Hosts canónicos por portal. Se usan para detección automática del portal
 * desde una URL arbitraria (p. ej. cuando el Worker recibe una `portalUrl`
 * y necesita decidir qué extractor invocar).
 */
const HOST_TO_PORTAL: Array<{ matchHost: (host: string) => boolean; portal: PortalSlug }> = [
  { matchHost: (h) => h.endsWith("fotocasa.es"), portal: "fotocasa" },
  { matchHost: (h) => h.endsWith("pisos.com"), portal: "pisoscom" },
  { matchHost: (h) => h.endsWith("milanuncios.com"), portal: "milanuncios" },
  { matchHost: (h) => h.endsWith("idealista.com"), portal: "idealista" },
];

export function portalForSource(source: MarketSource): PortalSlug {
  return SOURCE_TO_PORTAL[source];
}

export function sourceForPortal(portal: PortalSlug): MarketSource {
  return PORTAL_TO_SOURCE[portal];
}

/** Devuelve el slug del portal a partir de cualquier URL absoluta. */
export function detectPortalFromUrl(rawUrl: string): PortalSlug {
  try {
    const url = new URL(rawUrl);
    const host = url.host.toLowerCase();
    for (const entry of HOST_TO_PORTAL) {
      if (entry.matchHost(host)) return entry.portal;
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

export function sourceFromUrl(rawUrl: string): MarketSource {
  return sourceForPortal(detectPortalFromUrl(rawUrl));
}

/**
 * Slugs activos en el MVP.
 *
 * Excluye:
 *   - `milanuncios`: bloqueado por PerimeterX/HUMAN incluso con stealth
 *     (Playwright + puppeteer-extra-plugin-stealth, headed). Requiere Bright
 *     Data Web Unlocker para entrar en alcance. Ver docs/portal-html-analysis.md.
 *   - `idealista`: por defecto excluido. Se activa con `MARKET_IDEALISTA_ENABLED=true`
 *     (Fase 2.c, decisiones.md §11). Cuando esta activo, el flag dispara la
 *     incorporación de `source_d` al `ACTIVE_SOURCES_V1` en runtime via
 *     `getActiveSourcesV1()`.
 *
 * Cualquier cambio aquí debe ir acompañado de:
 *   1. Registro del extractor en `workers/market-worker/src/server.ts`.
 *   2. Crons correspondientes en QStash.
 *   3. Actualización del runbook en `docs/market-worker-deploy.md`.
 */
export const ACTIVE_PORTALS_V1_BASE: readonly PortalSlug[] = [
  "fotocasa",
  "pisoscom",
];

/**
 * Constante del MVP base. Para uso en lugares donde se quiere validar
 * "MVP-base sin Idealista" (eg, tests, validacion de seeds permitidos en
 * el endpoint `/api/market/seeds`). Para el filtro dinamico que usa el
 * scheduler, usar `getActiveSourcesV1()`.
 */
export const ACTIVE_PORTALS_V1: readonly PortalSlug[] = ACTIVE_PORTALS_V1_BASE;

/** Mismo conjunto pero como sources del enum Prisma. */
export const ACTIVE_SOURCES_V1: readonly MarketSource[] =
  ACTIVE_PORTALS_V1_BASE.map((p) => sourceForPortal(p));

/**
 * Devuelve el conjunto de sources activos en el momento. Lee
 * `MARKET_IDEALISTA_ENABLED` para decidir si `source_d` esta incluido.
 *
 * Lo usa el scheduler (`discoverDueSeeds`, `runCrawlTick`) para evitar
 * encolar trabajo de Idealista cuando el flag esta apagado, incluso si
 * los seeds existen activos en DB.
 */
export function getActiveSourcesV1(): readonly MarketSource[] {
  const idealistaOn =
    process.env.MARKET_IDEALISTA_ENABLED === "true" ||
    process.env.MARKET_IDEALISTA_ENABLED === "1";
  if (!idealistaOn) return ACTIVE_SOURCES_V1;
  return [...ACTIVE_SOURCES_V1, "source_d"];
}
