import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { withObservedRoute } from "@/lib/observability";

const postHandler = async (request: Request) => {
  if (!(await isQstashAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (process.env.MARKET_FEATURE_ENABLED === "false") {
    return NextResponse.json({ skipped: true, reason: "MARKET_FEATURE_ENABLED=false" });
  }

  try {
    const refreshed = await prisma.$executeRaw`
      UPDATE "market_advertisers" AS a
      SET
        "listingsCount" = sub.cnt,
        "lastSeenAt" = sub.last_seen
      FROM (
        SELECT
          "advertiserId" AS advertiser_id,
          COUNT(*)::int AS cnt,
          MAX("lastSeenAt") AS last_seen
        FROM "market_listings"
        WHERE "advertiserId" IS NOT NULL
        GROUP BY "advertiserId"
      ) sub
      WHERE a."id" = sub.advertiser_id
    `;

    const resetToZero = await prisma.$executeRaw`
      UPDATE "market_advertisers"
      SET "listingsCount" = 0
      WHERE "id" NOT IN (
        SELECT DISTINCT "advertiserId"
        FROM "market_listings"
        WHERE "advertiserId" IS NOT NULL
      )
    `;

    return NextResponse.json({
      ok: true,
      refreshed,
      resetToZero,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cron/market/refresh-advertiser-counts] error: ${message}`);
    return NextResponse.json({
      skipped: true,
      reason: "refresh advertiser counts failed",
      error: message,
    });
  }
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/cron/market/refresh-advertiser-counts" },
  postHandler,
);

export const maxDuration = 60;
