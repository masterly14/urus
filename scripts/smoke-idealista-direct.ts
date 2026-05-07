/**
 * Smoke directo del extractor Idealista (Fase 2.c).
 *
 * Ejecuta el extractor SIN levantar el Worker server completo. Usa:
 *  - Web Unlocker REST real (Bright Data) con credenciales del .env.
 *  - El parser DOM contra HTML real devuelto por la API.
 *  - Sin residencial (solo Web Unlocker primary). Si el primary se bloquea,
 *    el smoke termina con error claro y NO escala.
 *
 * Uso:
 *   # 1 pagina del seed con-pisos (~30 cards, ~$0.005 USD)
 *   BRIGHTDATA_API_TOKEN=... BRIGHTDATA_WEB_UNLOCKER_ZONE=web_unlocker1 \
 *     npx tsx scripts/smoke-idealista-direct.ts --limit 1
 *
 *   # 5 paginas del seed (~150 cards, ~$0.025 USD)
 *   npx tsx scripts/smoke-idealista-direct.ts --limit 5
 *
 *   # Otro seed
 *   npx tsx scripts/smoke-idealista-direct.ts --limit 1 \
 *     --seed-url https://www.idealista.com/venta-viviendas/cordoba-cordoba/
 *
 * Salida:
 *  - Lista resumida de las primeras 5 cards (externalId, precio, m², title).
 *  - Total de items, distribucion de campos, deteccion de duplicados.
 *  - Coste estimado.
 */

import "dotenv/config";
import { createIdealistaExtractor } from "../workers/market-worker/src/portals/idealista/extractor";
import { createWebUnlockerFetcher } from "../workers/market-worker/src/fetchers/web-unlocker";

interface CliOptions {
  limit: number;
  seedUrl: string;
  zone: string;
  country: string;
  pricePerRequestUsd: number;
}

const DEFAULT_SEED = "https://www.idealista.com/venta-viviendas/cordoba-cordoba/con-pisos/";

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    limit: 1,
    seedUrl: DEFAULT_SEED,
    zone: process.env.BRIGHTDATA_WEB_UNLOCKER_ZONE?.trim() || "web_unlocker1",
    country: process.env.BRIGHTDATA_WEB_UNLOCKER_COUNTRY?.trim() || "es",
    pricePerRequestUsd: Number(process.env.BRIGHTDATA_WEB_UNLOCKER_PREMIUM_PRICE_USD ?? "0.005"),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--limit" && next) {
      opts.limit = Math.max(1, Math.min(10, Number(next)));
      i++;
    } else if (a === "--seed-url" && next) {
      opts.seedUrl = next;
      i++;
    } else if (a === "--zone" && next) {
      opts.zone = next;
      i++;
    } else if (a === "--help" || a === "-h") {
      console.log("Uso: npx tsx scripts/smoke-idealista-direct.ts --limit <N> [--seed-url URL] [--zone ZONE]");
      process.exit(0);
    } else {
      throw new Error(`Argumento no reconocido: ${a}`);
    }
  }
  return opts;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const apiToken = process.env.BRIGHTDATA_API_TOKEN?.trim();
  if (!apiToken) {
    console.error("[smoke-idealista] BRIGHTDATA_API_TOKEN no configurado en .env");
    process.exit(2);
  }

  console.log(`[smoke-idealista] zone=${opts.zone} country=${opts.country}`);
  console.log(`[smoke-idealista] seed=${opts.seedUrl}`);
  console.log(`[smoke-idealista] limit=${opts.limit} pagina(s)`);
  console.log("");

  const fetcher = createWebUnlockerFetcher({
    apiToken,
    zone: opts.zone,
    country: opts.country,
    timeoutMs: 60_000,
  });

  const extractor = createIdealistaExtractor({
    fetcher,
    maxPages: opts.limit,
    politeDelayMs: 4_000,
    perRequestTimeoutMs: 60_000,
  });

  const startedAt = Date.now();
  const result = await extractor.extract({
    source: "source_d",
    operation: "sale",
    url: opts.seedUrl,
    cursor: null,
    budgetMs: 5 * 60_000,
    budgetRequests: opts.limit,
    traceId: `smoke-${Date.now()}`,
  });
  const elapsedMs = Date.now() - startedAt;

  console.log(`[smoke-idealista] elapsed=${elapsedMs}ms kind=${result.kind}`);

  if (result.kind === "blocked") {
    console.error(`[smoke-idealista] BLOCKED: ${result.reason}`);
    console.error(`  pagesScanned=${result.pagesScanned}`);
    process.exit(3);
  }
  if (result.kind === "error") {
    console.error(`[smoke-idealista] ERROR: ${result.errorCode} - ${result.errorReason}`);
    console.error(`  pagesScanned=${result.pagesScanned}`);
    process.exit(4);
  }

  const items = result.items;
  console.log(`[smoke-idealista] pagesScanned=${result.pagesScanned} items=${items.length}`);
  console.log("");

  if (items.length === 0) {
    console.warn("[smoke-idealista] AVISO: 0 items extraidos.");
    console.warn("  Posibles causas: HTML degradado, selectores cambiaron, o pagina vacia.");
    console.warn("  Revisar `docs/portal-html-analysis.md` y recapturar.");
    process.exit(5);
  }

  // Sample: primeras 5 cards.
  console.log("[smoke-idealista] sample (primeras 5 cards):");
  for (const item of items.slice(0, 5)) {
    const p = item.payload;
    console.log(
      `  - id=${item.externalId} precio=${p.priceRaw ?? "?"} m2=${p.surfaceRaw ?? "?"} hab=${p.roomsRaw ?? "?"} title="${(p.title ?? "").slice(0, 80)}"`,
    );
  }

  // Estadisticas de cobertura.
  const withPrice = items.filter((i) => i.payload.priceRaw).length;
  const withSurface = items.filter((i) => i.payload.surfaceRaw).length;
  const withRooms = items.filter((i) => i.payload.roomsRaw).length;
  const withTitle = items.filter((i) => i.payload.title).length;
  const withZone = items.filter((i) => i.payload.zoneRaw).length;
  const withImage = items.filter((i) => i.payload.mainImageUrl).length;
  const uniqueIds = new Set(items.map((i) => i.externalId)).size;

  console.log("");
  console.log("[smoke-idealista] cobertura de campos (sobre", items.length, "items):");
  console.log(
    `  precio=${withPrice} m2=${withSurface} hab=${withRooms} title=${withTitle} zona=${withZone} imagen=${withImage}`,
  );
  console.log(`  IDs unicos=${uniqueIds} (esperado: ${items.length})`);

  if (uniqueIds !== items.length) {
    console.warn(`[smoke-idealista] AVISO: dedupe imperfecto (${items.length - uniqueIds} duplicados)`);
  }

  // Coste estimado.
  const estimatedCostUsd = result.pagesScanned * opts.pricePerRequestUsd;
  console.log("");
  console.log(
    `[smoke-idealista] coste estimado: ~$${estimatedCostUsd.toFixed(4)} (${result.pagesScanned} requests x $${opts.pricePerRequestUsd}/req)`,
  );
  console.log(`[smoke-idealista] OK`);
}

main().catch((err) => {
  console.error("[smoke-idealista] fallo fatal:", err);
  process.exit(99);
});
