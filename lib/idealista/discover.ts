import type { Page, Response } from "playwright";
import { evaluateRobots, type RobotsPolicy } from "./robots";
import type {
  IdealistaDiscoveryEndpoint,
  IdealistaDiscoveryReport,
  IdealistaListing,
  IdealistaSeed,
} from "./types";

function shouldTrackEndpoint(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.endsWith("idealista.com");
  } catch {
    return false;
  }
}

export function attachDiscoveryRecorder(page: Page): {
  endpoints: IdealistaDiscoveryEndpoint[];
  detach: () => void;
} {
  const endpoints = new Map<string, IdealistaDiscoveryEndpoint>();
  const listener = (response: Response) => {
    const url = response.url();
    if (!shouldTrackEndpoint(url)) return;
    endpoints.set(url, {
      url,
      status: response.status(),
      contentType: response.headers()["content-type"],
    });
  };

  page.on("response", listener);

  return {
    get endpoints() {
      return [...endpoints.values()];
    },
    detach: () => page.off("response", listener),
  };
}

export async function runDiscoveryForSeed(params: {
  page: Page;
  seed: IdealistaSeed;
  policy: RobotsPolicy;
  listings: IdealistaListing[];
  endpoints: IdealistaDiscoveryEndpoint[];
}): Promise<IdealistaDiscoveryReport> {
  const jsonScriptCount = await params.page
    .locator("script[type='application/json'],script#__NEXT_DATA__,script[type='application/ld+json']")
    .count()
    .catch(() => 0);

  const blockedDetailUrls = params.listings
    .filter((listing) => !evaluateRobots(params.policy, listing.url).allowed)
    .map((listing) => listing.url);

  return {
    seed: params.seed,
    fetchedAt: new Date().toISOString(),
    allowedByRobots: params.policy.verified
      ? evaluateRobots(params.policy, params.seed.url).allowed
      : false,
    listingCount: params.listings.length,
    jsonScriptCount,
    endpoints: params.endpoints.slice(0, 200),
    blockedDetailUrls,
  };
}
