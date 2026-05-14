/**
 * POST /api/cron/market/purge (cada 24 h)
 *
 * Aplica las politicas de retencion definidas en
 * `docs/core-sistema-mercado-decisiones.md §7`:
 *
 *   - MarketRawListing: borrar capturas con `capturedAt < now - 30d`
 *     (configurable via MARKET_RAW_RETENTION_DAYS).
 *   - MarketListingVersion: borrar versions con `capturedAt < now - 365d`
 *     (configurable via MARKET_VERSIONS_RETENTION_DAYS). En V2 se
 *     agregaran a una tabla mensual antes de borrar.
 */

import { NextResponse } from "next/server";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { withObservedRoute } from "@/lib/observability";
import { prisma } from "@/lib/prisma";

const DEFAULT_RAW_DAYS = 30;
const DEFAULT_VERSION_DAYS = 365;

function readDays(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const postHandler = async (request: Request) => {
  if (!(await isQstashAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (process.env.MARKET_FEATURE_ENABLED === "false") {
    return NextResponse.json({ skipped: true, reason: "MARKET_FEATURE_ENABLED=false" });
  }

  const rawDays = readDays("MARKET_RAW_RETENTION_DAYS", DEFAULT_RAW_DAYS);
  const versionDays = readDays(
    "MARKET_VERSIONS_RETENTION_DAYS",
    DEFAULT_VERSION_DAYS,
  );

  const now = new Date();
  const rawCutoff = new Date(now.getTime() - rawDays * 24 * 3_600_000);
  const versionCutoff = new Date(now.getTime() - versionDays * 24 * 3_600_000);

  try {
    const [rawDeleted, versionsDeleted] = await Promise.all([
      prisma.marketRawListing.deleteMany({
        where: { capturedAt: { lt: rawCutoff } },
      }),
      prisma.marketListingVersion.deleteMany({
        where: { capturedAt: { lt: versionCutoff } },
      }),
    ]);

    console.log(
      `[cron/market/purge] rawDeleted=${rawDeleted.count} versionsDeleted=${versionsDeleted.count} rawCutoff=${rawCutoff.toISOString()} versionCutoff=${versionCutoff.toISOString()}`,
    );

    return NextResponse.json({
      ok: true,
      rawDeleted: rawDeleted.count,
      versionsDeleted: versionsDeleted.count,
      rawCutoff: rawCutoff.toISOString(),
      versionCutoff: versionCutoff.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cron/market/purge] error: ${message}`);
    return NextResponse.json({
      skipped: true,
      reason: "purge threw",
      error: message,
    });
  }
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/cron/market/purge" },
  postHandler,
);

export const maxDuration = 120;
