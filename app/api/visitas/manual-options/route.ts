import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getSessionFromRequest,
  isCeoOrAdmin,
  unauthorized,
} from "@/lib/auth/session";
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

  if (!isCeoOrAdmin(session.role) && !comercialId) {
    return NextResponse.json({ ok: true, demands: [], properties: [] });
  }

  const [demands, properties] = await Promise.all([
    prisma.demandCurrent.findMany({
      where: {
        ...(comercialId ? { comercialId } : {}),
        leadStatus: { notIn: ["CERRADO", "PERDIDO"] },
        ...(q ? {
          OR: [
            { codigo: { contains: q, mode: "insensitive" } },
            { nombre: { contains: q, mode: "insensitive" } },
            { telefono: { contains: q, mode: "insensitive" } },
          ],
        } : {}),
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
  ]);

  return NextResponse.json({ ok: true, demands, properties });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/visitas/manual-options" },
  getHandler,
);
