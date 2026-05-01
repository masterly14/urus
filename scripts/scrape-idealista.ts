import "dotenv/config";
import { DEFAULT_IDEALISTA_OPTIONS, runIdealistaScraper } from "@/lib/idealista";
import type { IdealistaCity, IdealistaScrapeOptions } from "@/lib/idealista";

function parseBooleanFlag(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}

function parseArgs(argv: string[]): Partial<IdealistaScrapeOptions> {
  const options: Partial<IdealistaScrapeOptions> = {};

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--city" && next) {
      if (next !== "cordoba" && next !== "sevilla" && next !== "all") {
        throw new Error("--city debe ser cordoba, sevilla o all");
      }
      options.city = next as IdealistaCity | "all";
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
    } else if (arg === "--storage-state" && next) {
      options.storageStatePath = next;
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
    } else if (arg === "--allow-unverified-robots") {
      options.allowUnverifiedRobots = true;
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
    process.env.IDEALISTA_HEADLESS != null
      ? parseBooleanFlag(process.env.IDEALISTA_HEADLESS)
      : undefined;
  const options = {
    ...DEFAULT_IDEALISTA_OPTIONS,
    ...cliOptions,
    ...(process.env.IDEALISTA_STORAGE_STATE
      ? { storageStatePath: process.env.IDEALISTA_STORAGE_STATE }
      : {}),
    ...(envHeadless == null ? {} : { headless: envHeadless }),
  };

  console.log("\n[idealista] Scraper base ventas");
  console.log(`[idealista] Ciudad: ${options.city}`);
  console.log(`[idealista] Max listings/semilla: ${options.maxListingsPerSeed}`);
  console.log(`[idealista] Max detalles: ${options.maxDetails}`);
  console.log(`[idealista] Output: ${options.outputDir}`);
  console.log(`[idealista] Robots sin verificar: ${options.allowUnverifiedRobots ? "permitido" : "no"}`);
  console.log(`[idealista] Storage state: ${options.storageStatePath ? options.storageStatePath : "no"}`);
  console.log(`[idealista] Dry-run: ${options.dryRun ? "sí" : "no"}\n`);

  const result = await runIdealistaScraper(options);

  console.log(`[idealista] Listados normalizados: ${result.listings.length}`);
  console.log(`[idealista] Reports de discovery: ${result.reports.length}`);
  if (result.validationErrors.length > 0) {
    console.warn("[idealista] Validaciones con avisos:");
    for (const error of result.validationErrors.slice(0, 20)) {
      console.warn(`  - ${error}`);
    }
  }
  if (result.outputFiles.length > 0) {
    console.log("[idealista] Archivos generados:");
    for (const file of result.outputFiles) {
      console.log(`  - ${file}`);
    }
  }
}

main().catch((err) => {
  console.error(`[idealista] Error fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
