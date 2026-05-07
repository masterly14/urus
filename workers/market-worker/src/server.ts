/**
 * Market Worker — server HTTP (Fastify).
 *
 * Responsabilidad: exponer los dos endpoints del contrato y delegar
 * en `MarketWorkerRuntime` (que vive en el monorepo). Toda la lógica
 * testeable está fuera de este archivo, aquí solo hay transport.
 *
 * Ejecución en producción (Railway):
 *   npm start  →  tsx src/server.ts
 */

import "dotenv/config";
import Fastify from "fastify";
import { PrismaClient } from "@prisma/client";
import {
  MARKET_WORKER_AUTH_HEADER,
  MARKET_WORKER_CRAWL_DETAIL_PATH,
  MARKET_WORKER_CRAWL_SEED_PATH,
  MARKET_WORKER_HEALTH_PATH,
} from "../../../lib/workers/contracts/market-worker";
import { MarketWorkerRuntime } from "../../../lib/workers/market-worker";
import type {
  DetailCaptureCallback,
  MarketExtractor,
} from "../../../lib/workers/market-worker";
import type { MarketSource } from "../../../lib/market";
import { loadWorkerConfig } from "./config";
import {
  createDirectBrowserFetcher,
  createIdealistaChain,
  createWebUnlockerFetcher,
  type Fetcher,
} from "./fetchers";
import { createFotocasaExtractor } from "./portals/fotocasa/extractor";
import { createPisoscomExtractor } from "./portals/pisoscom/extractor";
import { createIdealistaExtractor } from "./portals/idealista/extractor";
import { captureFotocasaDetail } from "./portals/fotocasa/detail";
import { capturePisoscomDetail } from "./portals/pisoscom/detail";
import { captureIdealistaDetail } from "./portals/idealista/detail";
import type { WarmSessionPrismaClient } from "../../../lib/scraping/warm-session";
import type { Page } from "playwright";

async function main(): Promise<void> {
  const config = loadWorkerConfig();

  const prisma = new PrismaClient({
    datasources: { db: { url: config.databaseUrl } },
  });

  // Pisos.com se sirve con `direct-browser` (sin Bright Data, segun
  // docs/core-sistema-mercado-decisiones.md §2.2).
  //
  // Fotocasa:
  //   - Default (`MARKET_FOTOCASA_USE_BRIGHTDATA=false`): `direct-browser` con
  //     scroll. Captura ~25 cards de pag.1, sin descripción/teléfono/imageUrls
  //     completos, y NO accede al detail (PerimeterX bloquea desde data-centers).
  //   - Activado (`MARKET_FOTOCASA_USE_BRIGHTDATA=true`): `web-unlocker` con
  //     header `x-unblock-expect: {"element":"body"}` reutilizando la MISMA
  //     zona de Idealista. Devuelve HTML real con `__INITIAL_PROPS__` que
  //     trae descripción, **teléfono del anunciante**, fotos, advertiserType
  //     y reference SIN simular click "Ver teléfono" — todo está en el HTML
  //     estático (verificado 7/05/2026 vs Fotocasa real, 31 anuncios/pag,
  //     1.5MB de HTML por listing, 945KB por detail).
  //
  // Milanuncios queda fuera del registry V1: requiere captura desde IP
  // residencial (PerimeterX bloquea desde data-centers — ver docs/portal-html-analysis.md).
  // Idealista (source_d) entra solo si MARKET_IDEALISTA_ENABLED=true (Fase 2.c).

  let fotocasaFetcher: Fetcher;
  let fotocasaMaxPages: number | undefined;
  let fotocasaPoliteDelayMs = config.politeDelayMs;

  const fc = config.fotocasa;
  const fotocasaBrightDataMissing: string[] = [];
  if (fc.useBrightData) {
    if (!config.idealista.brightDataApiToken) fotocasaBrightDataMissing.push("BRIGHTDATA_API_TOKEN");
    if (!fc.webUnlockerZone) {
      fotocasaBrightDataMissing.push(
        "BRIGHTDATA_WEB_UNLOCKER_ZONE (o BRIGHTDATA_FOTOCASA_WEB_UNLOCKER_ZONE)",
      );
    }
  }

  if (fc.useBrightData && fotocasaBrightDataMissing.length === 0) {
    fotocasaFetcher = createWebUnlockerFetcher({
      apiToken: config.idealista.brightDataApiToken!,
      zone: fc.webUnlockerZone!,
      country: fc.webUnlockerCountry,
      timeoutMs: fc.webUnlockerTimeoutMs,
      // Override per-request del expect_element configurado a nivel de
      // zona. Necesario para reutilizar la zona de Idealista (que tiene
      // `expect_element=.re-SharedTopbar`) en Fotocasa. Requiere que la
      // zona tenga "Manual 'expect' elements" habilitado en el dashboard.
      extraHeaders: {
        "x-unblock-expect": JSON.stringify({ element: fc.expectElement }),
      },
    });
    fotocasaMaxPages = fc.maxPages;
    fotocasaPoliteDelayMs = fc.politeDelayMs;
    console.log(
      `[market-worker] Fotocasa Bright Data habilitado: zone=${fc.webUnlockerZone} ` +
        `country=${fc.webUnlockerCountry} expect=${fc.expectElement} maxPages=${fc.maxPages}`,
    );
  } else {
    if (fc.useBrightData && fotocasaBrightDataMissing.length > 0) {
      console.warn(
        `[market-worker] MARKET_FOTOCASA_USE_BRIGHTDATA=true pero faltan vars: ` +
          `${fotocasaBrightDataMissing.join(", ")}. Cayendo a direct-browser.`,
      );
    }
    // Fotocasa direct-browser: necesita scroll para que las cards lazy-loaded
    // aparezcan en el DOM antes de que el parser las lea. Sin scroll captura
    // ~2 cards; con scroll captura ~25 (verificado contra portal real, 06/05/2026).
    fotocasaFetcher = createDirectBrowserFetcher({
      headless: config.playwrightHeadless,
      scrollToBottom: true,
      hydratedSelector: 'a[href*="/es/comprar/vivienda/"][href$="/d"]',
    });
  }

  // Pisos.com: las cards `<div class="ad-preview">` estan en el HTML
  // inicial. No hace falta scroll.
  const pisoscomFetcher = createDirectBrowserFetcher({
    headless: config.playwrightHeadless,
  });
  const extractors = new Map<MarketSource, MarketExtractor>([
    [
      "source_a",
      createFotocasaExtractor({
        fetcher: fotocasaFetcher,
        politeDelayMs: fotocasaPoliteDelayMs,
        ...(fotocasaMaxPages != null ? { maxPages: fotocasaMaxPages } : {}),
      }),
    ],
    [
      "source_b",
      createPisoscomExtractor({
        fetcher: pisoscomFetcher,
        politeDelayMs: config.politeDelayMs,
      }),
    ],
  ]);
  const detailFetchers = new Map<MarketSource, Fetcher>([
    ["source_a", fotocasaFetcher],
    ["source_b", pisoscomFetcher],
  ]);

  // Callbacks de capture interactivo per-portal. El runtime los invoca
  // cuando el fetcher correspondiente soporta `capture()` (todos los
  // browser-based: direct-browser, idealista-residential).
  const captureCallbacks = new Map<MarketSource, DetailCaptureCallback>([
    [
      "source_a",
      async (ctx) =>
        captureFotocasaDetail(ctx.page as Page, ctx.beforeHtml),
    ],
    [
      "source_b",
      async (ctx) =>
        capturePisoscomDetail(ctx.page as Page, ctx.beforeHtml),
    ],
  ]);

  // Idealista (source_d) — Fase 2.c. Solo si la config esta completa Y
  // MARKET_IDEALISTA_ENABLED=true. Falla suave: si falta algo, log warning
  // y NO registra el extractor (los crons no encolaran source_d porque
  // ACTIVE_SOURCES_V1 los filtra; el Worker tampoco respondera).
  if (config.idealista.enabled) {
    const i = config.idealista;
    const missing: string[] = [];
    if (!i.brightDataApiToken) missing.push("BRIGHTDATA_API_TOKEN");
    if (!i.webUnlockerZone) missing.push("BRIGHTDATA_WEB_UNLOCKER_ZONE");
    if (!i.brightDataScrapingBrowserUrl) missing.push("BRIGHTDATA_SCRAPING_BROWSER_URL");
    if (!i.residentialProxyUrl) missing.push("BRIGHTDATA_RESIDENTIAL_PROXY_URL");
    if (missing.length > 0) {
      console.warn(
        `[market-worker] MARKET_IDEALISTA_ENABLED=true pero faltan vars: ${missing.join(", ")}. ` +
          `source_d NO se registra.`,
      );
    } else {
      const idealistaChain = createIdealistaChain({
        webUnlocker: {
          apiToken: i.brightDataApiToken!,
          zone: i.webUnlockerZone!,
          country: i.webUnlockerCountry,
          timeoutMs: i.webUnlockerTimeoutMs,
        },
        residential: {
          prisma: prisma as unknown as WarmSessionPrismaClient,
          brightDataUrl: i.brightDataScrapingBrowserUrl,
          residentialProxyUrl: i.residentialProxyUrl!,
          residentialProxyUsername: i.residentialProxyUsername,
          residentialProxyPassword: i.residentialProxyPassword,
          residentialProxySession: i.residentialProxySession,
          policy: {
            enabled: true,
            requireCdp: true,
            ttlMs: i.warmSessionTtlMs,
            maxRequests: i.warmSessionMaxRequests,
          },
          headless: config.playwrightHeadless,
        },
        onFallback: (event) => {
          console.warn(
            `[market-worker][idealista] fallback ${event.fromStrategy} -> ${event.toStrategy}: ${event.reason}`,
          );
        },
      });
      extractors.set(
        "source_d",
        createIdealistaExtractor({
          fetcher: idealistaChain,
          maxPages: 5,
          politeDelayMs: 4_000,
          perRequestTimeoutMs: 60_000,
        }),
      );
      detailFetchers.set("source_d", idealistaChain);
      captureCallbacks.set("source_d", async (ctx) =>
        captureIdealistaDetail(ctx.page as Page, ctx.beforeHtml),
      );
      console.log(
        `[market-worker] Idealista (source_d) habilitado: zone=${i.webUnlockerZone} country=${i.webUnlockerCountry}`,
      );
    }
  }

  const runtime = new MarketWorkerRuntime({
    secret: config.sharedSecret,
    prisma,
    extractors,
    detailFetchers,
    captureCallbacks,
    concurrency: config.maxConcurrentBrowsers,
    defaultDeadlineMs: config.defaultDeadlineMs,
    version: config.version,
  });

  const app = Fastify({
    logger: {
      level: config.logLevel,
    },
    bodyLimit: 1024 * 1024, // 1 MiB es más que suficiente para CrawlSeedRequest
  });

  // -------------------------------------------------------------------------
  // GET /internal/health (público para healthcheck del proveedor)
  // -------------------------------------------------------------------------
  app.get(MARKET_WORKER_HEALTH_PATH, async (_req, reply) => {
    const health = runtime.health();
    return reply.code(200).send(health);
  });

  // -------------------------------------------------------------------------
  // POST /internal/market/crawl/seed (protegido por shared secret)
  // -------------------------------------------------------------------------
  app.post(MARKET_WORKER_CRAWL_SEED_PATH, async (req, reply) => {
    const headerSecret = req.headers[MARKET_WORKER_AUTH_HEADER];
    const headerValue = Array.isArray(headerSecret) ? headerSecret[0] : headerSecret;
    if (!runtime.isAuthorized(headerValue ?? null)) {
      return reply.code(401).send({ status: "failed", errorReason: "unauthorized" });
    }

    const validation = runtime.validatePayload(req.body);
    if (!validation.ok) {
      return reply.code(validation.status).send({
        status: "failed",
        errorReason: validation.error,
      });
    }

    const result = await runtime.runCrawlSeed(validation.data);
    // Mapeo de estado del runtime a HTTP status:
    //   completed | accepted | blocked → 200 (el cliente discrimina por `status`)
    //   failed con RUN_NOT_FOUND        → 404
    //   failed con cualquier otro       → 500
    if (result.status === "failed") {
      const code = result.errorCode === "RUN_NOT_FOUND" ? 404 : 500;
      return reply.code(code).send(result);
    }
    return reply.code(200).send(result);
  });

  // -------------------------------------------------------------------------
  // POST /internal/market/crawl/detail (protegido por shared secret)
  // -------------------------------------------------------------------------
  app.post(MARKET_WORKER_CRAWL_DETAIL_PATH, async (req, reply) => {
    const headerSecret = req.headers[MARKET_WORKER_AUTH_HEADER];
    const headerValue = Array.isArray(headerSecret) ? headerSecret[0] : headerSecret;
    if (!runtime.isAuthorized(headerValue ?? null)) {
      return reply.code(401).send({ status: "failed", errorReason: "unauthorized" });
    }

    const validation = runtime.validateDetailPayload(req.body);
    if (!validation.ok) {
      return reply.code(validation.status).send({
        status: "failed",
        errorReason: validation.error,
      });
    }

    const result = await runtime.runCrawlDetail(validation.data);
    if (result.status === "failed") return reply.code(500).send(result);
    if (result.status === "blocked") return reply.code(200).send(result);
    return reply.code(200).send(result);
  });

  // -------------------------------------------------------------------------
  // Errores no controlados → 500 con shape estándar
  // -------------------------------------------------------------------------
  app.setErrorHandler((err: unknown, _req, reply) => {
    app.log.error({ err }, "Error no controlado en handler");
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : "unknown";
    return reply.code(500).send({
      status: "failed",
      errorReason: message,
    });
  });

  // -------------------------------------------------------------------------
  // Start
  // -------------------------------------------------------------------------
  try {
    await app.listen({ port: config.port, host: "0.0.0.0" });
    app.log.info(
      `[market-worker] listening on :${config.port} version=${config.version} ` +
        `extractors=[${runtime.registeredSources().join(",")}] ` +
        `concurrency=${config.maxConcurrentBrowsers}`,
    );
  } catch (err) {
    app.log.error({ err }, "No se pudo iniciar el server");
    process.exit(1);
  }

  // Apagado limpio (SIGTERM de Railway/Docker).
  const shutdown = async (signal: string) => {
    app.log.info(`[market-worker] señal ${signal} recibida, cerrando…`);
    try {
      await app.close();
    } catch (err) {
      app.log.warn({ err }, "Fallo al cerrar Fastify");
    }
    try {
      await prisma.$disconnect();
    } catch (err) {
      app.log.warn({ err }, "Fallo al desconectar Prisma");
    }
    process.exit(0);
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[market-worker] fallo fatal en main():", err);
  process.exit(1);
});
