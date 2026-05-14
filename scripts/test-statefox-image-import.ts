/**
 * Script live cercano a producción para validar el pipeline de cache de imágenes
 * de comparables Statefox contra anuncios reales (Idealista, Fotocasa, etc.).
 *
 * Modos:
 *   - Por defecto: simula Smart Pricing → consulta Statefox `/snapshot`, busca
 *     comparables con `pImages` caducadas y `pLink` válido y ejecuta el discovery
 *     (dry-run) o el import completo a Cloudinary (--upload).
 *   - Manual: si pasas `--portal-url`, opera contra esa URL concreta. En este modo
 *     también puedes pasar `--statefox-id` para registrar la cache en --upload.
 *
 * Ejemplos:
 *   # Dry-run con Statefox real (simula Smart Pricing)
 *   npx tsx scripts/test-statefox-image-import.ts --limit 3
 *
 *   # Upload a Cloudinary con los primeros 5 comparables expirados de Idealista
 *   npx tsx scripts/test-statefox-image-import.ts --upload --limit 5 --source idealista
 *
 *   # Modo manual contra una URL concreta
 *   npx tsx scripts/test-statefox-image-import.ts --portal-url https://www.idealista.com/inmueble/12345/
 */

import "dotenv/config";
import {
  detectPortalSource,
  discoverPortalImages,
  importStatefoxPortalImages,
  normalizePortalUrl,
} from "@/lib/statefox/image-cache";
import { createStatefoxClient, getSnapshot } from "@/lib/statefox/client";
import { isExpiredStatefoxImageUrl } from "@/lib/statefox/image-expiry";
import { acquireWarmSession, invalidateActiveWarmSessions } from "@/lib/scraping/warm-session";
import { getStatefoxImageImportConfig } from "@/lib/statefox/image-cache/config";
import type { StatefoxPortalSource as PortalSource } from "@prisma/client";
import type { StatefoxListingType } from "@/lib/statefox/types";

type SupportedPortalSource = Exclude<PortalSource, "unknown">;

type CliOptions = {
  portalUrl: string | null;
  statefoxId: string | null;
  upload: boolean;
  maxImages: number;
  limit: number;
  source: SupportedPortalSource | null;
  listingType: StatefoxListingType;
  maxPages: number;
  itemsPerPage: number;
  warm: boolean;
  noWarm: boolean;
  invalidateWarm: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    portalUrl: null,
    statefoxId: null,
    upload: false,
    maxImages: 3,
    limit: 3,
    source: null,
    listingType: "sale",
    maxPages: 6,
    itemsPerPage: 250,
    warm: false,
    noWarm: false,
    invalidateWarm: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const next = argv[index + 1];
    switch (arg) {
      case "--portal-url":
      case "--url":
        if (!next) throw new Error("--portal-url requiere un valor");
        options.portalUrl = next;
        index++;
        break;
      case "--statefox-id":
      case "--id":
        if (!next) throw new Error("--statefox-id requiere un valor");
        options.statefoxId = next;
        index++;
        break;
      case "--max-images":
        if (!next) throw new Error("--max-images requiere un valor");
        options.maxImages = Math.max(1, Number(next));
        index++;
        break;
      case "--limit":
        if (!next) throw new Error("--limit requiere un valor");
        options.limit = Math.max(1, Number(next));
        index++;
        break;
      case "--source":
        if (!next) throw new Error("--source requiere un valor");
        options.source = parseSource(next);
        index++;
        break;
      case "--type":
      case "--listing-type":
        if (!next) throw new Error("--type requiere un valor");
        options.listingType = parseListingType(next);
        index++;
        break;
      case "--max-pages":
        if (!next) throw new Error("--max-pages requiere un valor");
        options.maxPages = Math.max(1, Number(next));
        index++;
        break;
      case "--items-per-page":
        if (!next) throw new Error("--items-per-page requiere un valor");
        options.itemsPerPage = Math.max(1, Math.min(250, Number(next)));
        index++;
        break;
      case "--upload":
        options.upload = true;
        break;
      case "--dry-run":
        options.upload = false;
        break;
      case "--warm":
        options.warm = true;
        break;
      case "--no-warm":
        options.noWarm = true;
        process.env.STATEFOX_WARM_SESSION_ENABLED = "false";
        break;
      case "--invalidate":
        options.invalidateWarm = true;
        break;
      case "--cdp":
        process.env.STATEFOX_IDEALISTA_DIRECT_CDP_ENABLED = "true";
        if (!process.env.STATEFOX_IMAGE_IMPORT_TIMEOUT_MS) {
          process.env.STATEFOX_IMAGE_IMPORT_TIMEOUT_MS = "150000";
        }
        break;
      case "--no-cdp":
        process.env.STATEFOX_IDEALISTA_DIRECT_CDP_ENABLED = "false";
        break;
      case "--web-unlocker":
      case "--unlocker":
        process.env.BRIGHTDATA_WEB_UNLOCKER_ENABLED = "true";
        break;
      case "--no-web-unlocker":
      case "--no-unlocker":
        process.env.BRIGHTDATA_WEB_UNLOCKER_ENABLED = "false";
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Argumento no reconocido: ${arg}`);
    }
  }

  return options;
}

function parseSource(value: string): SupportedPortalSource {
  const valid: SupportedPortalSource[] = ["idealista", "fotocasa", "pisoscom", "habitaclia"];
  if (!valid.includes(value as SupportedPortalSource)) {
    throw new Error(`--source inválido. Valores: ${valid.join(", ")}`);
  }
  return value as SupportedPortalSource;
}

function parseListingType(value: string): StatefoxListingType {
  if (value !== "sale" && value !== "rent") {
    throw new Error("--type debe ser sale o rent");
  }
  return value;
}

function printHelp(): void {
  console.log(
    [
      "Uso: tsx scripts/test-statefox-image-import.ts [opciones]",
      "",
      "Modo Smart Pricing (default):",
      "  Sin --portal-url, el script consulta Statefox /snapshot, busca comparables",
      "  con pImages caducadas y pLink válido, y prueba el flujo de import contra cada uno.",
      "",
      "Opciones:",
      "  --limit <N>            Comparables expirados a procesar (default: 3)",
      "  --source <portal>      Filtra por portal: idealista, fotocasa, pisoscom, habitaclia",
      "  --type <sale|rent>     Tipo de operación en /snapshot (default: sale)",
      "  --max-pages <N>        Máx páginas Statefox a paginar (default: 6)",
      "  --items-per-page <N>   Items por página /snapshot (default: 250, max 250)",
      "  --max-images <N>       Imágenes a importar por comparable (default: 3)",
      "  --upload               Ejecuta el flujo completo (descarga + Cloudinary + Neon)",
      "  --dry-run              Solo descubre candidatas (default si no se pasa --upload)",
      "  --warm                 Fuerza adquisición de warm session antes de procesar",
      "  --no-warm              Desactiva warm session para comparar con residencial directo",
      "  --invalidate           Invalida warm sessions activas del portal antes de ejecutar",
      "  --cdp                  Fuerza Bright Data Scraping Browser CDP directo (Idealista)",
      "  --no-cdp               Desactiva CDP directo y vuelve a residencial + warm session",
      "  --web-unlocker         Fuerza Bright Data Web Unlocker para Idealista (REST API)",
      "  --no-web-unlocker      Desactiva Web Unlocker (vuelve al flujo Playwright)",
      "",
      "Modo manual:",
      "  --portal-url <URL>     URL del anuncio en el portal",
      "  --statefox-id <ID>     ID Statefox para registrar la cache (obligatorio en --upload)",
      "",
      "  -h, --help             Muestra esta ayuda",
    ].join("\n"),
  );
}

async function prepareWarmSessionForSource(source: SupportedPortalSource): Promise<void> {
  const config = getStatefoxImageImportConfig();
  const result = await acquireWarmSession({
    source,
    policy: {
      enabled: config.warmSessionEnabled,
      requireCdp: config.warmSessionRequireCdp,
      ttlMs: config.warmSessionTtlMs,
      maxRequests: config.warmSessionMaxRequests,
    },
    headless: config.headless,
    brightDataUrl: config.brightDataUrl,
    brightDataConnectTimeoutMs: config.brightDataConnectTimeoutMs,
    captchaSolveEnabled: config.brightDataCaptchaSolve,
    captchaDetectTimeoutMs: config.brightDataCaptchaDetectTimeoutMs,
  });
  if (result.status === "unavailable") {
    console.log(`[statefox:image-cache] warm session no disponible: ${result.reason}`);
    return;
  }
  console.log(
    `[statefox:image-cache] warm session lista source=${source} id=${result.session.id} warmed=${result.warmed} usos=${result.session.requestCount}/${result.session.maxRequests}`,
  );
}

async function prepareWarmSession(options: CliOptions, source: SupportedPortalSource): Promise<void> {
  if (options.invalidateWarm) {
    const count = await invalidateActiveWarmSessions({
      source,
      reason: "Invalidada manualmente desde scripts/test-statefox-image-import.ts --invalidate",
    });
    console.log(`[statefox:image-cache] warm sessions invalidadas source=${source}: ${count}`);
  }
  if (options.warm && !options.noWarm) {
    await prepareWarmSessionForSource(source);
  }
}

type ExpiredComparable = {
  statefoxId: string;
  source: SupportedPortalSource;
  portalUrl: string;
  totalImages: number;
  expiredImages: number;
  freshImages: number;
};

async function findExpiredComparablesFromStatefox(
  options: CliOptions,
): Promise<ExpiredComparable[]> {
  const client = createStatefoxClient();
  const expired: ExpiredComparable[] = [];
  let cursor: string | undefined;
  let pagesScanned = 0;
  let totalScanned = 0;

  console.log(`[statefox:image-cache] consultando /snapshot type=${options.listingType}...`);

  while (pagesScanned < options.maxPages && expired.length < options.limit) {
    const response = await getSnapshot(client, {
      items: options.itemsPerPage,
      type: options.listingType,
      status: "active",
      next: cursor,
    });
    pagesScanned++;
    const entries = Object.entries(response.result ?? {});
    totalScanned += entries.length;

    for (const [id, prop] of entries) {
      if (expired.length >= options.limit) break;
      const link = typeof prop.pLink === "string" ? prop.pLink.trim() : "";
      if (!link) continue;

      const portalUrl = normalizePortalUrl(link);
      if (!portalUrl) continue;
      const source = detectPortalSource(portalUrl);
      if (source === "unknown") continue;
      if (options.source && source !== options.source) continue;

      const rawImages = Array.isArray(prop.pImages)
        ? prop.pImages.filter(
            (u): u is string =>
              typeof u === "string" && (u.startsWith("http://") || u.startsWith("https://")),
          )
        : [];
      if (rawImages.length === 0) continue;

      const expiredImages = rawImages.filter((u) => isExpiredStatefoxImageUrl(u));
      const freshImages = rawImages.length - expiredImages.length;

      // El target del script es el caso real: tiene fotos pero todas caducadas.
      if (expiredImages.length === 0) continue;

      expired.push({
        statefoxId: id,
        source,
        portalUrl,
        totalImages: rawImages.length,
        expiredImages: expiredImages.length,
        freshImages,
      });
    }

    const nextCursor = response.meta?.next;
    if (!nextCursor || entries.length === 0) break;
    cursor = nextCursor;
  }

  console.log(
    `[statefox:image-cache] /snapshot: páginas=${pagesScanned} comparables_escaneados=${totalScanned} con_pImages_caducadas=${expired.length}`,
  );

  return expired;
}

async function processManualUrl(options: CliOptions): Promise<void> {
  const portalUrl = normalizePortalUrl(options.portalUrl as string);
  if (!portalUrl) {
    throw new Error(`URL de portal inválida: ${options.portalUrl}`);
  }
  const source = detectPortalSource(portalUrl);
  if (source !== "unknown") {
    await prepareWarmSession(options, source);
  }
  console.log(`[statefox:image-cache] portal detectado: ${source}`);
  console.log(`[statefox:image-cache] portal URL:        ${portalUrl}`);
  console.log(`[statefox:image-cache] modo:              ${options.upload ? "UPLOAD" : "DRY-RUN"}`);

  if (!options.upload) {
    await runDiscoveryAndPrint(portalUrl);
    return;
  }
  if (!options.statefoxId) {
    throw new Error("--upload requiere --statefox-id en modo manual");
  }
  await runImportAndPrint({
    statefoxId: options.statefoxId,
    portalUrl,
    source,
    maxImages: options.maxImages,
  });
}

async function processFromStatefox(options: CliOptions): Promise<void> {
  if (options.source) {
    await prepareWarmSession(options, options.source);
  } else if (options.warm || options.invalidateWarm) {
    await prepareWarmSession(options, "idealista");
  }
  const expired = await findExpiredComparablesFromStatefox(options);
  if (expired.length === 0) {
    console.log(
      "[statefox:image-cache] No se encontraron comparables con pImages caducadas. Prueba con --max-pages mayor o sin --source.",
    );
    return;
  }

  console.log(`[statefox:image-cache] modo: ${options.upload ? "UPLOAD" : "DRY-RUN"}`);
  console.log(`[statefox:image-cache] procesando ${expired.length} comparables expirados:\n`);

  let successCount = 0;
  let failureCount = 0;
  for (let i = 0; i < expired.length; i++) {
    const target = expired[i];
    console.log(
      `── (${i + 1}/${expired.length}) ${target.statefoxId} · ${target.source} · ` +
        `imgs=${target.totalImages} (caducadas=${target.expiredImages}, frescas=${target.freshImages})`,
    );
    console.log(`   pLink: ${target.portalUrl}`);

    try {
      if (options.upload) {
        const outcome = await runImportAndPrint({
          statefoxId: target.statefoxId,
          portalUrl: target.portalUrl,
          source: target.source,
          maxImages: options.maxImages,
        });
        if (outcome.status === "IMPORTED") successCount++;
        else failureCount++;
      } else {
        await runDiscoveryAndPrint(target.portalUrl);
      }
    } catch (err) {
      failureCount++;
      console.error(
        `   error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    console.log("");
  }

  if (options.upload) {
    console.log(
      `[statefox:image-cache] resumen: imported=${successCount}/${expired.length} (fallidos=${failureCount})`,
    );
  }
}

async function runDiscoveryAndPrint(portalUrl: string): Promise<void> {
  const discovery = await discoverPortalImages(portalUrl);
  const config = getStatefoxImageImportConfig();
  const portalSource = detectPortalSource(portalUrl);
  const webUnlockerActive =
    portalSource === "idealista" &&
    config.webUnlockerEnabled &&
    Boolean(config.webUnlockerZone) &&
    Boolean(config.brightDataApiToken);
  const cdpActive =
    !webUnlockerActive && Boolean(config.brightDataUrl) && config.idealistaDirectCdpEnabled;
  if (webUnlockerActive) {
    console.log(`   modo extracción:     web-unlocker (zona=${config.webUnlockerZone})`);
  } else if (cdpActive) {
    console.log(`   modo extracción:     brightdata-cdp`);
  } else {
    console.log(`   modo extracción:     local/residencial`);
  }
  console.log(`   discovery status:    ${discovery.status}`);
  if (discovery.errorReason) {
    console.log(`   discovery error:     ${discovery.errorReason}`);
  }
  console.log(`   candidatas:          ${discovery.candidates.length}`);
  if (cdpActive) {
    if (discovery.brightDataSessionId) {
      console.log(`   brightdata session:  ${discovery.brightDataSessionId}`);
    } else {
      console.log(
        `   brightdata session:  (no capturado — Browser.getSessionId no respondió; revisa los logs anteriores)`,
      );
    }
    if (discovery.brightDataSession) {
      const s = discovery.brightDataSession;
      console.log(
        `   brightdata detail:   status=${s.status} navigations=${s.navigations} captcha=${s.captcha}`,
      );
      if (s.endUrl) console.log(`   brightdata end_url:  ${s.endUrl}`);
      if (s.errorCode || s.errorMessage) {
        console.log(`   brightdata error:    [${s.errorCode ?? "n/a"}] ${s.errorMessage ?? ""}`);
      }
    } else if (discovery.brightDataSessionId) {
      const reason = config.brightDataApiToken
        ? "API respondió !ok o lanzó al consultar la sesión"
        : "BRIGHTDATA_API_TOKEN no está configurado";
      console.log(`   brightdata detail:   (no se pudo consultar la API: ${reason})`);
    }
  }
  for (const candidate of discovery.candidates.slice(0, 5)) {
    console.log(`   - [${candidate.source}] ${candidate.url}`);
  }
  if (discovery.candidates.length > 5) {
    console.log(`   ... (+${discovery.candidates.length - 5} más)`);
  }
}

async function runImportAndPrint(args: {
  statefoxId: string;
  portalUrl: string;
  source: PortalSource | "unknown";
  maxImages: number;
}): Promise<Awaited<ReturnType<typeof importStatefoxPortalImages>>> {
  const outcome = await importStatefoxPortalImages({
    statefoxId: args.statefoxId,
    portalUrl: args.portalUrl,
    source: args.source === "unknown" ? undefined : args.source,
    maxImages: args.maxImages,
  });
  console.log(`   import status:       ${outcome.status}`);
  console.log(`   imported:            ${outcome.importedCount}/${outcome.candidateCount}`);
  if (outcome.errorReason) {
    console.log(`   error:               ${outcome.errorReason}`);
  }
  return outcome;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.portalUrl) {
    await processManualUrl(options);
    return;
  }

  if (!process.env.STATEFOX_BEARER_TOKEN) {
    throw new Error(
      "STATEFOX_BEARER_TOKEN no está definido. Configúralo en .env o pasa --portal-url para usar el modo manual.",
    );
  }
  await processFromStatefox(options);
}

main().catch((err) => {
  console.error(`[statefox:image-cache] Error fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
