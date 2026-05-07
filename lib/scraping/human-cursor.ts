import type { Locator, Page } from "playwright";
import { path } from "ghost-cursor";

type Vector = { x: number; y: number };

export type HumanCursor = {
  page: Page;
  location: Vector;
  enabled: boolean;
};

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

async function jitter(page: Page, minMs = 200, maxMs = 800): Promise<void> {
  await page.waitForTimeout(Math.floor(randomBetween(minMs, maxMs))).catch(() => undefined);
}

export function createHumanCursor(page: Page, enabled = true): HumanCursor {
  return {
    page,
    location: { x: randomBetween(80, 240), y: randomBetween(140, 320) },
    enabled,
  };
}

async function moveTo(cursor: HumanCursor, destination: Vector): Promise<void> {
  if (!cursor.enabled) {
    await cursor.page.mouse.move(destination.x, destination.y).catch(() => undefined);
    cursor.location = destination;
    return;
  }
  const points = path(cursor.location, destination, {
    spreadOverride: 12,
    moveSpeed: randomBetween(450, 900),
  }) as Vector[];
  for (const point of points) {
    await cursor.page.mouse.move(point.x, point.y).catch(() => undefined);
  }
  cursor.location = destination;
}

async function boundingBox(locator: Locator) {
  const handle = await locator.elementHandle({ timeout: 1_500 }).catch(() => null);
  if (!handle) return null;
  return handle.boundingBox().catch(() => null);
}

export async function humanClick(cursor: HumanCursor, locator: Locator): Promise<boolean> {
  const box = await boundingBox(locator);
  if (!box) return false;
  const destination = {
    x: box.x + randomBetween(Math.max(4, box.width * 0.25), Math.max(6, box.width * 0.75)),
    y: box.y + randomBetween(Math.max(4, box.height * 0.25), Math.max(6, box.height * 0.75)),
  };
  await moveTo(cursor, destination);
  await jitter(cursor.page, 120, 500);
  await cursor.page.mouse.down().catch(() => undefined);
  await jitter(cursor.page, 60, 180);
  await cursor.page.mouse.up().catch(() => undefined);
  return true;
}

export async function humanScrollPartial(
  cursor: HumanCursor,
  ratio = 0.3,
): Promise<void> {
  const viewport = cursor.page.viewportSize() ?? { width: 1366, height: 900 };
  await moveTo(cursor, {
    x: randomBetween(viewport.width * 0.35, viewport.width * 0.75),
    y: randomBetween(viewport.height * 0.35, viewport.height * 0.75),
  });
  const distance = Math.max(120, Math.floor(viewport.height * ratio));
  const chunks = Math.max(2, Math.ceil(distance / 280));
  for (let index = 0; index < chunks; index++) {
    await cursor.page.mouse.wheel(0, Math.floor(distance / chunks)).catch(() => undefined);
    await jitter(cursor.page, 120, 380);
  }
}

export async function humanMoveToBottom(cursor: HumanCursor): Promise<void> {
  await humanScrollPartial(cursor, 0.85);
}
