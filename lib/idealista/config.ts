import type { IdealistaScrapeOptions, IdealistaSeed } from "./types";

export const IDEALISTA_BASE_URL = "https://www.idealista.com";
export const IDEALISTA_ROBOTS_URL = `${IDEALISTA_BASE_URL}/robots.txt`;
export const IDEALISTA_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export const IDEALISTA_SEEDS: IdealistaSeed[] = [
  {
    city: "cordoba",
    operation: "sale",
    label: "Pisos en venta en Cordoba",
    url: "https://www.idealista.com/venta-viviendas/cordoba-cordoba/con-pisos/",
  },
  {
    city: "sevilla",
    operation: "sale",
    label: "Pisos en venta en Sevilla",
    url: "https://www.idealista.com/venta-viviendas/sevilla-sevilla/con-pisos/",
  },
  {
    city: "sevilla",
    operation: "sale",
    label: "Viviendas en venta en Sevilla provincia",
    url: "https://www.idealista.com/venta-viviendas/sevilla-provincia/",
  },
];

export const DEFAULT_IDEALISTA_OPTIONS: IdealistaScrapeOptions = {
  city: "all",
  operation: "sale",
  headless: true,
  maxListingsPerSeed: 30,
  maxDetails: 0,
  outputDir: "data/idealista",
  delayMs: 3_000,
  dryRun: false,
  allowUnverifiedRobots: false,
};
