import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getSessionFromRequest,
  isCeoOrAdmin,
  unauthorized,
} from "@/lib/auth/session";
import { buildDemandSearchConditions } from "@/lib/demands/search";
import { withObservedRoute } from "@/lib/observability";

const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 25)));
  const comercialId = isCeoOrAdmin(session.role)
    ? url.searchParams.get("comercialId") || undefined
    : session.comercialId || undefined;
  const demandSearchConditions = buildDemandSearchConditions(q);

  if (!isCeoOrAdmin(session.role) && !comercialId) {
    return NextResponse.json({ ok: true, demands: [], properties: [], comerciales: [], demandPropertyTypes: [], localidades: [], currentComercialId: null });
  }

  const [demands, properties, comerciales, demandPropertyTypes, localidades] = await Promise.all([
    prisma.demandCurrent.findMany({
      where: {
        ...(comercialId ? { comercialId } : {}),
        leadStatus: { notIn: ["CERRADO", "PERDIDO"] },
        ...(demandSearchConditions.length > 0 ? { OR: demandSearchConditions } : {}),
      },
      select: {
        codigo: true,
        nombre: true,
        telefono: true,
        leadStatus: true,
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    }),
    prisma.propertyCurrent.findMany({
      where: {
        nodisponible: false,
        ...(q ? {
          OR: [
            { codigo: { contains: q, mode: "insensitive" } },
            { ref: { contains: q, mode: "insensitive" } },
            { titulo: { contains: q, mode: "insensitive" } },
            { zona: { contains: q, mode: "insensitive" } },
            { ciudad: { contains: q, mode: "insensitive" } },
          ],
        } : {}),
      },
      select: {
        codigo: true,
        ref: true,
        refCatastral: true,
        titulo: true,
        ciudad: true,
        zona: true,
        precio: true,
        habitaciones: true,
        metrosConstruidos: true,
        mainPhotoUrl: true,
        portalUrl: true,
        propietarioNombre: true,
        propietarioPhone: true,
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    }),
    prisma.comercial.findMany({
      where: {
        activo: true,
        ...(isCeoOrAdmin(session.role) ? {} : { id: comercialId }),
      },
      select: {
        id: true,
        nombre: true,
        ciudad: true,
        inmovillaAgentId: true,
      },
      orderBy: { nombre: "asc" },
    }),
    prisma.inmovillaEnumTipo.findMany({
      where: { tipo: "key_tipo" },
      select: { valor: true, nombre: true },
      orderBy: { nombre: "asc" },
      take: 200,
    }),
    prisma.inmovillaEnumCiudad.findMany({
      select: { key_loca: true, ciudad: true, provincia: true },
      orderBy: [{ provincia: "asc" }, { ciudad: "asc" }],
      take: 500,
    }),
  ]);

  return NextResponse.json({
    ok: true,
    demands,
    properties,
    comerciales,
    demandPropertyTypes,
    localidades,
    currentComercialId: session.comercialId ?? null,
  });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/visitas/manual-options" },
  getHandler,
);
