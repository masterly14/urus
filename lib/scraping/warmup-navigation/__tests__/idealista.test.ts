import { describe, expect, it, vi } from "vitest";
import { createHumanCursor } from "@/lib/scraping/human-cursor";
import { politeIdealistaNavigation } from "../idealista";

function invisibleLocator() {
  return {
    first: () => invisibleLocator(),
    isVisible: vi.fn(async () => false),
    elementHandle: vi.fn(async () => null),
  };
}

describe("politeIdealistaNavigation", () => {
  it("navega por home antes de saltar al anuncio cuando warmup está activo", async () => {
    const response = { status: () => 200 };
    const page = {
      goto: vi.fn(async (url: string) => (url.includes("/inmueble/") ? response : null)),
      waitForLoadState: vi.fn(async () => undefined),
      waitForTimeout: vi.fn(async () => undefined),
      locator: vi.fn(() => invisibleLocator()),
      getByRole: vi.fn(() => invisibleLocator()),
      viewportSize: () => ({ width: 1366, height: 900 }),
      mouse: {
        move: vi.fn(async () => undefined),
        wheel: vi.fn(async () => undefined),
      },
    };

    const result = await politeIdealistaNavigation(
      page as never,
      createHumanCursor(page as never, false),
      "https://www.idealista.com/inmueble/123/",
      { totalTimeoutMs: 60_000, warmupEnabled: true },
    );

    expect(result).toBe(response);
    expect(page.goto).toHaveBeenNthCalledWith(1, "https://www.idealista.com/", {
      waitUntil: "commit",
      timeout: 30_000,
    });
    expect(page.goto).toHaveBeenNthCalledWith(2, "https://www.idealista.com/inmueble/123/", {
      waitUntil: "commit",
      timeout: 60_000,
    });
  });
});
