/**
 * GET  /api/market/listings/opportunities
 * POST /api/market/listings/opportunities
 *
 * Lista anuncios (`MarketListing`) para la UI de captacion por zona.
 * Devuelve una fila por listing con direccion, m2, precio/m2, hab, banos,
 * ciudad, zona, telefono, publicante, portal y foto principal.
 *
 * Permisos: cualquier usuario autenticado (mismo nivel que advertisers).
 *
 * Filtros (compartidos GET/POST):
 *   - city?, sources?, operation?, advertiserType?, hasPhone?, sinceHours?
 *   - priceMin/Max, areaMin/Max, roomsMin
 *   - polygon: array de [lng, lat] (>=3 puntos) cuando el usuario dibuja
 *     un area en el mapa. En GET se pasa como JSON URL-encoded; en POST
 *     en el body.
 *   - cursor, limit
 *
 * Por que GET y POST: el polygon puede crecer mucho (10-100 puntos) y
 * algunos clientes/CDNs cortan URLs largas. POST permite enviarlo en body
 * con limites mas generosos. El semantico es identico.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, unauthorized } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import {
  listOpportunityListings,
  type ListingOpportunityFilters,
} from "@/lib/market/listings";
import { validatePolygon, type Polygon } from "@/lib/market/geo/polygon";
import type {
  MarketOperation,
  MarketSource,
} from "@/lib/market/types";

const VALID_SOURCES: MarketSource[] = [
  "source_a",
  "source_b",
  "source_c",
  "source_d",
];

const polygonSchema = z
  .array(
    z
      .tuple([z.number().finite(), z.number().finite()])
      .or(
        z.object({ lng: z.number().finite(), lat: z.number().finite() }),
      ),
  )
  .min(3)
  .max(500);

const filtersBodySchema = z.object({
  city: z.string().min(1).max(64).optional(),
  sources: z.array(z.string()).optional(),
  operation: z.enum(["sale", "rent"]).optional(),
  advertiserType: z.enum(["particular", "agency"]).optional(),
  hasPhone: z.boolean().optional(),
  priceMin: z.number().int().nonnegative().optional(),
  priceMax: z.number().int().positive().optional(),
  areaMin: z.number().int().nonnegative().optional(),
  areaMax: z.number().int().positive().optional(),
  roomsMin: z.number().int().nonnegative().optional(),
  sinceHours: z.number().int().positive().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().positive().max(100).optional(),
  polygon: polygonSchema.optional(),
});

function asPositiveInt(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.floor(n);
}

function asInt(value: string | null): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.floor(n);
}

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

function parseSourcesParam(raw: string | null): MarketSource[] | undefined {
  if (!raw) return undefined;
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as MarketSource[];
  const valid = parts.filter((s) => VALID_SOURCES.includes(s));
  return valid.length > 0 ? valid : undefined;
}

function parseOperationParam(raw: string | null): MarketOperation | undefined {
  if (raw === "sale" || raw === "rent") return raw;
  return undefined;
}

function buildFiltersFromQuery(url: URL): ListingOpportunityFilters {
  const sp = url.searchParams;
  let polygon: Polygon | undefined;
  const polygonRaw = sp.get("polygon");
  if (polygonRaw) {
    try {
      const parsed = JSON.parse(polygonRaw);
      polygon = normalizePolygon(parsed);
    } catch {
      polygon = undefined;
    }
  }
  const advType = sp.get("advertiserType");
  return {
    city: sp.get("city") ?? undefined,
    sources: parseSourcesParam(sp.get("sources")),
    operation: parseOperationParam(sp.get("operation")),
    advertiserType:
      advType === "particular" || advType === "agency" ? advType : undefined,
    hasPhone: sp.get("hasPhone") === "1" || sp.get("hasPhone") === "true",
    priceMin: asInt(sp.get("priceMin")),
    priceMax: asInt(sp.get("priceMax")),
    areaMin: asInt(sp.get("areaMin")),
    areaMax: asInt(sp.get("areaMax")),
    roomsMin: asInt(sp.get("roomsMin")),
    sinceHours: asPositiveInt(sp.get("sinceHours")),
    cursor: sp.get("cursor") ?? undefined,
    limit: asPositiveInt(sp.get("limit")),
    polygon,
  };
}

function buildFiltersFromBody(body: z.infer<typeof filtersBodySchema>): ListingOpportunityFilters {
  return {
    city: body.city,
    sources: body.sources?.filter((s): s is MarketSource =>
      VALID_SOURCES.includes(s as MarketSource),
    ),
    operation: body.operation,
    advertiserType: body.advertiserType,
    hasPhone: body.hasPhone,
    priceMin: body.priceMin,
    priceMax: body.priceMax,
    areaMin: body.areaMin,
    areaMax: body.areaMax,
    roomsMin: body.roomsMin,
    sinceHours: body.sinceHours,
    cursor: body.cursor,
    limit: body.limit,
    polygon: normalizePolygon(body.polygon),
  };
}

async function handle(request: Request, filters: ListingOpportunityFilters) {
  if (filters.polygon) {
    const validation = validatePolygon(filters.polygon, {
      restrictToSpain: true,
    });
    if (!validation.valid) {
      return NextResponse.json(
        { ok: false, error: { code: "INVALID_POLYGON", message: validation.reason } },
        { status: 400 },
      );
    }
  }
  const result = await listOpportunityListings(filters);
  return NextResponse.json({ ok: true, ...result });
}

const getHandler = async (request: Request) => {
  const session = await getSession();
  if (!session) return unauthorized();
  const url = new URL(request.url);
  const filters = buildFiltersFromQuery(url);
  return handle(request, filters);
};

const postHandler = async (request: Request) => {
  const session = await getSession();
  if (!session) return unauthorized();
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_JSON", message: "Body no es JSON" } },
      { status: 400 },
    );
  }
  const parsed = filtersBodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INVALID_PAYLOAD",
          message: parsed.error.message,
        },
      },
      { status: 400 },
    );
  }
  const filters = buildFiltersFromBody(parsed.data);
  return handle(request, filters);
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/market/listings/opportunities" },
  getHandler,
);

export const POST = withObservedRoute(
  { method: "POST", route: "/api/market/listings/opportunities" },
  postHandler,
);

export const dynamic = "force-dynamic";
