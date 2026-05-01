export type IdealistaCity = "cordoba" | "sevilla";

export type IdealistaOperation = "sale";

export type IdealistaSeed = {
  city: IdealistaCity;
  operation: IdealistaOperation;
  label: string;
  url: string;
};

export type IdealistaScrapeOptions = {
  city?: IdealistaCity | "all";
  operation: IdealistaOperation;
  headless: boolean;
  maxListingsPerSeed: number;
  maxDetails: number;
  outputDir: string;
  delayMs: number;
  dryRun: boolean;
  allowUnverifiedRobots: boolean;
  storageStatePath?: string;
};

export type IdealistaListing = {
  source: "idealista";
  operation: IdealistaOperation;
  city: IdealistaCity;
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

export type IdealistaDetail = Partial<
  Pick<
    IdealistaListing,
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

export type IdealistaDiscoveryEndpoint = {
  url: string;
  status?: number;
  contentType?: string;
};

export type IdealistaDiscoveryReport = {
  seed: IdealistaSeed;
  fetchedAt: string;
  allowedByRobots: boolean;
  listingCount: number;
  jsonScriptCount: number;
  endpoints: IdealistaDiscoveryEndpoint[];
  blockedDetailUrls: string[];
};

export type RobotsDecision = {
  allowed: boolean;
  matchedRule?: string;
  matchedDirective?: "allow" | "disallow";
};
