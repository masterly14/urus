/**
 * GET  /api/market/seeds   → lista seeds activos/inactivos.
 * POST /api/market/seeds   → upsert idempotente (admin only).
 *
 * El POST acepta un seed individual o un array.
 *
 * Solo admin/CEO pueden escribir. Lectura tambien es admin/CEO en MVP
 * (no hay consumidor productivo, ver core-mvp-status §1).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  forbidden,
  getSession,
  isCeoOrAdmin,
  unauthorized,
} from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import {
  MARKET_OPERATIONS,
  MARKET_SOURCES,
  type MarketSource,
} from "@/lib/market/types";
import { getActiveSourcesV1 } from "@/lib/market/source-mapping";

const seedInputSchema = z.object({
  source: z.enum(MARKET_SOURCES as readonly [MarketSource, ...MarketSource[]]),
  operation: z.enum(MARKET_OPERATIONS as readonly ["sale", "rent"]),
  city: z.string().min(1),
  zone: z.string().nullable().optional(),
  url: z.string().url(),
  active: z.boolean().optional().default(true),
  priority: z.number().int().min(0).max(1000).optional().default(100),
  cadenceMinutes: z.number().int().min(15).max(1440).optional().default(120),
  notes: z.string().optional().default(""),
});

const postSchema = z.union([seedInputSchema, z.array(seedInputSchema)]);

const getHandler = async (_request: Request) => {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

  const seeds = await prisma.marketSeed.findMany({
    orderBy: [{ active: "desc" }, { priority: "desc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({
    ok: true,
    seeds: seeds.map((s) => ({
      id: s.id,
      source: s.source,
      operation: s.operation,
      city: s.city,
      zone: s.zone,
      url: s.url,
      active: s.active,
      priority: s.priority,
      cadenceMinutes: s.cadenceMinutes,
      notes: s.notes,
      lastRunAt: s.lastRunAt?.toISOString() ?? null,
      lastCursor: s.lastCursor,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })),
  });
};

const postHandler = async (request: Request) => {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

  const body = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "Payload invalido",
        details: parsed.error.issues.map(
          (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
        ),
      },
      { status: 400 },
    );
  }

  const seeds = Array.isArray(parsed.data) ? parsed.data : [parsed.data];

  // Defensa en profundidad: rechazar source que no este en
  // `getActiveSourcesV1()` (incluye source_d cuando MARKET_IDEALISTA_ENABLED=true).
  // Nunca permitimos milanuncios por API (`source_c`).
  const activeSources = getActiveSourcesV1();
  for (const seed of seeds) {
    if (!activeSources.includes(seed.source)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            `source ${seed.source} no esta activo. Activos ahora: ${activeSources.join(", ")}` +
            (seed.source === "source_d"
              ? " (activa MARKET_IDEALISTA_ENABLED=true para Idealista)"
              : ""),
        },
        { status: 422 },
      );
    }
  }

  const results: Array<{ id: string; created: boolean }> = [];
  for (const seed of seeds) {
    const existing = await prisma.marketSeed.findUnique({
      where: {
        source_operation_city_zone_url: {
          source: seed.source,
          operation: seed.operation,
          city: seed.city,
          zone: seed.zone ?? "",
          url: seed.url,
        },
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.marketSeed.update({
        where: { id: existing.id },
        data: {
          active: seed.active,
          priority: seed.priority,
          cadenceMinutes: seed.cadenceMinutes,
          notes: seed.notes,
        },
      });
      results.push({ id: existing.id, created: false });
    } else {
      const created = await prisma.marketSeed.create({
        data: {
          source: seed.source,
          operation: seed.operation,
          city: seed.city,
          zone: seed.zone ?? null,
          url: seed.url,
          active: seed.active,
          priority: seed.priority,
          cadenceMinutes: seed.cadenceMinutes,
          notes: seed.notes,
        },
        select: { id: true },
      });
      results.push({ id: created.id, created: true });
    }
  }

  return NextResponse.json({ ok: true, results });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/market/seeds" },
  getHandler,
);
export const POST = withObservedRoute(
  { method: "POST", route: "/api/market/seeds" },
  postHandler,
);

export const dynamic = "force-dynamic";
