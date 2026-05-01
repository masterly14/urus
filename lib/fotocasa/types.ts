export type FotocasaCity = "cordoba" | "sevilla";

export type FotocasaOperation = "sale";

export type FotocasaSeed = {
  city: FotocasaCity;
  operation: FotocasaOperation;
  label: string;
  url: string;
};

export type FotocasaScrapeOptions = {
  city?: FotocasaCity | "all";
  operation: FotocasaOperation;
  headless: boolean;
  maxListingsPerSeed: number;
  maxDetails: number;
  outputDir: string;
  delayMs: number;
  dryRun: boolean;
};

export type FotocasaListing = {
  source: "fotocasa";
  operation: FotocasaOperation;
  city: FotocasaCity;
  listingId?: string;
  url: string;
  title: string;
  price?: number;
  priceRaw?: string;
  surfaceM2?: number;
  rooms?: number;
  bathrooms?: number;
  floor?: string;
  neighborhood?: string;
  addressApprox?: string;
  description?: string;
  agencyName?: string;
  imageUrls: string[];
  capturedAt: string;
  rawText?: string;
};

export type FotocasaDetail = Partial<
  Pick<
    FotocasaListing,
    | "description"
    | "agencyName"
    | "addressApprox"
    | "neighborhood"
    | "imageUrls"
    | "floor"
    | "surfaceM2"
    | "rooms"
    | "bathrooms"
  >
> & {
  url: string;
  blockedByRobots: boolean;
};

export type FotocasaDiscoveryEndpoint = {
  url: string;
  status?: number;
  contentType?: string;
};

export type FotocasaDiscoveryReport = {
  seed: FotocasaSeed;
  fetchedAt: string;
  allowedByRobots: boolean;
  listingCount: number;
  jsonScriptCount: number;
  endpoints: FotocasaDiscoveryEndpoint[];
  blockedDetailUrls: string[];
};

export type RobotsDecision = {
  allowed: boolean;
  matchedRule?: string;
  matchedDirective?: "allow" | "disallow";
};
