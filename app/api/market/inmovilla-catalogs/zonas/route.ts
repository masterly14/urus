/**
 * GET /api/market/inmovilla-catalogs/zonas?city=<ciudad>
 *
 * Devuelve las zonas de Inmovilla (catálogo sincronizado en Neon vía
 * `scripts/sync-inmovilla-enums.ts`) para la ciudad indicada. Sirve para que
 * la UI de captación ofrezca al comercial un selector humano de zona en lugar
 * de pedirle el valor numérico `key_zona`.
 *
 * Permisos: usuario autenticado. Responde 400 si falta `city` o si no se
 * puede resolver `key_loca` desde el catálogo.
 *
 * Respuesta:
 *   { ok: true, keyLoca: number, items: { keyZona: number; zona: string }[] }
 */

import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import {
  getKeyLocaByCiudad,
  getZonasByKeyLoca,
} from "@/lib/inmovilla/rest";
import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";

const getHandler = async (request: Request) => {
  const session = await getSession();
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const city = url.searchParams.get("city")?.trim();
  if (!city) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INVALID_PAYLOAD",
          message: "Falta el parámetro 'city'.",
        },
      },
      { status: 400 },
    );
  }

  const keyLoca = await getKeyLocaByCiudad(prisma as unknown as PrismaClient, {
    ciudadNombre: city,
  });
  if (keyLoca == null) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "CITY_NOT_FOUND",
          message: `No hay catálogo Inmovilla para la ciudad '${city}'.`,
        },
      },
      { status: 404 },
    );
  }

  const rows = await getZonasByKeyLoca(
    prisma as unknown as PrismaClient,
    keyLoca,
  );
  const items = rows.map((row) => ({
    keyZona: row.key_zona,
    zona: row.zona,
  }));

  return NextResponse.json({ ok: true, keyLoca, items });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/market/inmovilla-catalogs/zonas" },
  getHandler,
);

export const dynamic = "force-dynamic";
