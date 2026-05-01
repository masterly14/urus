import "dotenv/config";
import { DEFAULT_FOTOCASA_OPTIONS, runFotocasaScraper } from "@/lib/fotocasa";
import type { FotocasaCity, FotocasaScrapeOptions } from "@/lib/fotocasa";

function parseBooleanFlag(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}

function parseArgs(argv: string[]): Partial<FotocasaScrapeOptions> {
  const options: Partial<FotocasaScrapeOptions> = {};

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--city" && next) {
      if (next !== "cordoba" && next !== "sevilla" && next !== "all") {
        throw new Error("--city debe ser cordoba, sevilla o all");
      }
      options.city = next as FotocasaCity | "all";
      index++;
    } else if (arg === "--max-listings" && next) {
      options.maxListingsPerSeed = Number(next);
      index++;
    } else if (arg === "--max-details" && next) {
      options.maxDetails = Number(next);
      index++;
    } else if (arg === "--output-dir" && next) {
      options.outputDir = next;
      index++;
    } else if (arg === "--delay-ms" && next) {
      options.delayMs = Number(next);
      index++;
    } else if (arg === "--headed") {
      options.headless = false;
    } else if (arg === "--headless") {
      options.headless = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--operation" && next) {
      if (next !== "sale") throw new Error("Por ahora --operation solo soporta sale");
      options.operation = "sale";
      index++;
    } else {
      throw new Error(`Argumento no reconocido: ${arg}`);
    }
  }

  return options;
}

async function main(): Promise<void> {
  const cliOptions = parseArgs(process.argv.slice(2));
  const envHeadless =
    process.env.FOTOCASA_HEADLESS != null
      ? parseBooleanFlag(process.env.FOTOCASA_HEADLESS)
      : undefined;
  const options = {
    ...DEFAULT_FOTOCASA_OPTIONS,
    ...cliOptions,
    ...(envHeadless == null ? {} : { headless: envHeadless }),
  };

  console.log("\n[fotocasa] Scraper base ventas");
  console.log(`[fotocasa] Ciudad: ${options.city}`);
  console.log(`[fotocasa] Max listings/semilla: ${options.maxListingsPerSeed}`);
  console.log(`[fotocasa] Max detalles: ${options.maxDetails}`);
  console.log(`[fotocasa] Output: ${options.outputDir}`);
  console.log(`[fotocasa] Dry-run: ${options.dryRun ? "sí" : "no"}\n`);

  const result = await runFotocasaScraper(options);

  console.log(`[fotocasa] Listados normalizados: ${result.listings.length}`);
  console.log(`[fotocasa] Reports de discovery: ${result.reports.length}`);
  if (result.validationErrors.length > 0) {
    console.warn("[fotocasa] Validaciones con avisos:");
    for (const error of result.validationErrors.slice(0, 20)) {
      console.warn(`  - ${error}`);
    }
  }
  if (result.outputFiles.length > 0) {
    console.log("[fotocasa] Archivos generados:");
    for (const file of result.outputFiles) {
      console.log(`  - ${file}`);
    }
  }
}

main().catch((err) => {
  console.error(`[fotocasa] Error fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
