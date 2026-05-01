import type { FotocasaScrapeOptions, FotocasaSeed } from "./types";

export const FOTOCASA_BASE_URL = "https://www.fotocasa.es";
export const FOTOCASA_ROBOTS_URL = `${FOTOCASA_BASE_URL}/robots.txt`;
export const FOTOCASA_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export const FOTOCASA_SEEDS: FotocasaSeed[] = [
  {
    city: "cordoba",
    operation: "sale",
    label: "Pisos en venta en Cordoba Capital",
    url: "https://www.fotocasa.es/es/comprar/pisos/cordoba-capital/todas-las-zonas/l",
  },
  {
    city: "cordoba",
    operation: "sale",
    label: "Viviendas en venta en Cordoba Capital",
    url: "https://www.fotocasa.es/es/comprar/viviendas/cordoba-capital/todas-las-zonas/l",
  },
  {
    city: "sevilla",
    operation: "sale",
    label: "Pisos en venta en Sevilla Capital",
    url: "https://www.fotocasa.es/es/comprar/pisos/sevilla-capital/todas-las-zonas/l",
  },
  {
    city: "sevilla",
    operation: "sale",
    label: "Pisos en venta en Sevilla Provincia",
    url: "https://www.fotocasa.es/es/comprar/pisos/Sevilla/todas-las-zonas/l",
  },
];

export const DEFAULT_FOTOCASA_OPTIONS: FotocasaScrapeOptions = {
  city: "all",
  operation: "sale",
  headless: true,
  maxListingsPerSeed: 30,
  maxDetails: 0,
  outputDir: "data/fotocasa",
  delayMs: 2_500,
  dryRun: false,
};
