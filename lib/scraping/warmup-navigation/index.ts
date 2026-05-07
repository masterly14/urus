import type { StatefoxPortalSource } from "@prisma/client";
import type { Page, Response } from "playwright";
import type { HumanCursor } from "@/lib/scraping/human-cursor";
import { humanScrollPartial } from "@/lib/scraping/human-cursor";
import { politeIdealistaNavigation } from "./idealista";

export async function politeNavigate(
  source: Exclude<StatefoxPortalSource, "unknown">,
  page: Page,
  cursor: HumanCursor,
  portalUrl: string,
  options: { totalTimeoutMs: number; warmupEnabled: boolean },
): Promise<Response | null> {
  if (source === "idealista") {
    return politeIdealistaNavigation(page, cursor, portalUrl, options);
  }

  const response = await page.goto(portalUrl, {
    waitUntil: "commit",
    timeout: options.totalTimeoutMs,
  });
  await page.waitForLoadState("domcontentloaded", { timeout: 8_000 }).catch(() => undefined);
  await humanScrollPartial(cursor, 0.15).catch(() => undefined);
  return response;
}
