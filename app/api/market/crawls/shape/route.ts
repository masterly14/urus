/**
 * POST /api/market/crawls/shape
 *
 * Encola un crawl Idealista on-demand contra un area dibujada por el
 * usuario en el mapa. Idealista soporta nativamente el filtro por poligono
 * via parametro `shape` (polyline de Google + base64 url-safe).
 *
 * Body:
 *   {
 *     polygon: [[lng, lat], ...]   // GeoJSON-like, >=3 puntos, <=500
 *     operation?: "sale" | "rent"  // default: "sale"
 *     housingPath?: string         // ej "con-pisos", "con-precio-hasta_300000"
 *     city?: string                // metadata, default: "cordoba"
 *   }
 *
 * Crea un `MarketSeed` efimero (`active=false`, notes="shape:adhoc:..."),
 * un `MarketCrawlRun` (RUNNING) y encola un `MARKET_CRAWL_SEED`. El cron
 * NO recoge estos seeds (active=false) — son one-shot.
 *
 * El consumer `runCrawlTick` los procesa con el Market Worker. La unica
 * dependencia es que el Market Worker este alcanzable y autorizado a
 * scrappear Idealista (Bright Data Web Unlocker / Scraping Browser).
 *
 * Permisos: CEO/admin (genera trafico contra Idealista, coste no trivial
 * por proxy + riesgo de captcha).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { enqueueJob } from "@/lib/job-queue";
import {
  forbidden,
  getSession,
  isCeoOrAdmin,
  unauthorized,
} from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import {
  buildIdealistaAreaUrl,
  validatePolygon,
  type Polygon,
} from "@/lib/market/geo";

const polygonPointSchema = z
  .tuple([z.number().finite(), z.number().finite()])
  .or(
    z.object({ lng: z.number().finite(), lat: z.number().finite() }),
  );

const bodySchema = z.object({
  polygon: z.array(polygonPointSchema).min(3).max(500),
  operation: z.enum(["sale", "rent"]).default("sale"),
  housingPath: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_-]+$/i, "housingPath debe ser slug seguro")
    .optional(),
  city: z.string().min(1).max(64).default("cordoba"),
});

function normalizePolygon(input: unknown): Polygon | undefined {
  if (!Array.isArray(input)) return undefined;
  const out: Polygon = [];
  for (const point of input) {
    if (Array.isArray(point) && point.length === 2) {
      out.push([Number(point[0]), Number(point[1])]);
    } else if (point && typeof point === "object") {
      const p = point as Record<string, unknown>;
      const lng = Number(p.lng);
      const lat = Number(p.lat);
      if (Number.isFinite(lng) && Number.isFinite(lat)) out.push([lng, lat]);
    }
  }
  return out.length >= 3 ? out : undefined;
}

const postHandler = async (request: Request) => {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "INVALID_PAYLOAD", message: parsed.error.message },
      },
      { status: 400 },
    );
  }

  const polygon = normalizePolygon(parsed.data.polygon);
  if (!polygon) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "INVALID_POLYGON", message: "polygon requiere >=3 puntos" },
      },
      { status: 400 },
    );
  }
  const validation = validatePolygon(polygon, { restrictToSpain: true });
  if (!validation.valid) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "INVALID_POLYGON", message: validation.reason },
      },
      { status: 400 },
    );
  }

  const url = buildIdealistaAreaUrl({
    operation: parsed.data.operation,
    housingPath: parsed.data.housingPath,
    polygonLngLat: polygon,
  });

  const correlationId = randomUUID();
  const minuteBucket = Math.floor(Date.now() / 60_000);

  // Hash corto del shape para idempotencia por usuario y minuto.
  // No incluye el url completo en idempotencyKey (puede ser muy largo) sino
  // un hash determinista derivado del url.
  const shapeHash = await hashHex(url);
  const idempotencyKey = `market:crawl:shape:${session.userId}:${shapeHash.slice(0, 12)}:${minuteBucket}`;

  // Seed efimero con active=false: no entrara al cron pero queda como
  // historial trazable.
  const seed = await prisma.marketSeed.create({
    data: {
      source: "source_d",
      operation: parsed.data.operation,
      city: parsed.data.city,
      zone: null,
      url,
      active: false,
      priority: 250,
      cadenceMinutes: 999_999,
      notes: `shape:adhoc:${session.userId}:${minuteBucket}`,
    },
  });

  const run = await prisma.marketCrawlRun.create({
    data: {
      seedId: seed.id,
      source: "source_d",
      status: "RUNNING",
      budgetMs: 90_000,
      budgetRequests: 80,
      cursorIn: null,
      correlationId,
    },
  });

  try {
    await enqueueJob({
      type: "MARKET_CRAWL_SEED",
      payload: {
        runId: run.id,
        seedId: seed.id,
        source: "source_d",
        operation: parsed.data.operation,
        url,
        cursor: null,
        budgetMs: 90_000,
        budgetRequests: 80,
        traceId: correlationId,
      },
      idempotencyKey,
      priority: 250,
    });

    return NextResponse.json({
      ok: true,
      runId: run.id,
      seedId: seed.id,
      shapeUrl: url,
      idempotencyKey,
      correlationId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/Unique constraint|P2002/i.test(message)) {
      await prisma.marketCrawlRun
        .delete({ where: { id: run.id } })
        .catch(() => undefined);
      await prisma.marketSeed
        .delete({ where: { id: seed.id } })
        .catch(() => undefined);
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "ALREADY_ENQUEUED",
            message:
              "Ya hay un crawl encolado para este poligono en el mismo minuto",
          },
        },
        { status: 409 },
      );
    }
    await prisma.marketCrawlRun
      .update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          errorCode: "ENQUEUE_ERROR",
          errorMessage: message.slice(0, 2000),
          finishedAt: new Date(),
        },
      })
      .catch(() => undefined);
    return NextResponse.json(
      { ok: false, error: { code: "ENQUEUE_ERROR", message } },
      { status: 500 },
    );
  }
};

async function hashHex(input: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(input).digest("hex");
}

export const POST = withObservedRoute(
  { method: "POST", route: "/api/market/crawls/shape" },
  postHandler,
);

export const dynamic = "force-dynamic";
