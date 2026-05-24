import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import type { AppSession } from "@/lib/auth/session";
import { canAccessOperacion, OPERACION_FORBIDDEN_ERROR } from "@/lib/operacion/access";
import { resolveDemandIdForProperty } from "@/lib/operacion/resolve-demand";
import { createInmovillaRestClient } from "@/lib/inmovilla/rest/client";
import { searchClient } from "@/lib/inmovilla/rest/clients";
import type { Prisma, LeadStatus } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

const TERMINAL_STATUSES: LeadStatus[] = ["CERRADO", "PERDIDO"];

const getHandler = async (request: Request, { params }: Params) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  const { id } = await params;

  const operacion = await prisma.operacion.findUnique({
    where: { id },
    select: { id: true, propertyCode: true, comercialId: true },
  });

  if (!operacion) {
    return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 });
  }

  if (!canAccessOperacion(session, operacion)) {
    return NextResponse.json({ error: OPERACION_FORBIDDEN_ERROR }, { status: 403 });
  }

  const url = new URL(request.url);
  const source = url.searchParams.get("source") || "local";

  if (source === "inmovilla") {
    return handleInmovillaSearch(url);
  }

  return handleLocalSearch(url, operacion, session);
};

async function handleLocalSearch(
  url: URL,
  operacion: { id: string; propertyCode: string; comercialId: string | null },
  session: AppSession,
) {
  const search = url.searchParams.get("search") || undefined;
  const comercialId =
    session.role === "ceo" || session.role === "admin"
      ? url.searchParams.get("comercialId") || operacion.comercialId || undefined
      : session.comercialId || undefined;
  const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 100);
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

  const where: Prisma.DemandCurrentWhereInput = {
    leadStatus: { notIn: TERMINAL_STATUSES },
  };
  if (comercialId) where.comercialId = comercialId;
  if (search) {
    where.nombre = { contains: search, mode: "insensitive" };
  }

  const [demands, total, suggestedDemandId] = await Promise.all([
    prisma.demandCurrent.findMany({
      where,
      select: {
        codigo: true,
        nombre: true,
        telefono: true,
        leadStatus: true,
        zonas: true,
        tipos: true,
        comercialId: true,
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.demandCurrent.count({ where }),
    resolveDemandIdForProperty(operacion.propertyCode),
  ]);

  let suggestedDemand = null;
  if (suggestedDemandId) {
    suggestedDemand = await prisma.demandCurrent.findUnique({
      where: { codigo: suggestedDemandId },
      select: {
        codigo: true,
        nombre: true,
        telefono: true,
        leadStatus: true,
        zonas: true,
        tipos: true,
        comercialId: true,
      },
    });
    if (
      suggestedDemand &&
      session.role !== "ceo" &&
      session.role !== "admin" &&
      suggestedDemand.comercialId !== session.comercialId
    ) {
      suggestedDemand = null;
    }
  }

  return NextResponse.json({ demands, total, suggestedDemand });
}

async function handleInmovillaSearch(url: URL) {
  const telefono = url.searchParams.get("telefono") || undefined;
  const email = url.searchParams.get("email") || undefined;

  if (!telefono && !email) {
    return NextResponse.json(
      { error: "Se requiere al menos telefono o email para buscar en Inmovilla" },
      { status: 400 },
    );
  }

  try {
    const client = createInmovillaRestClient();
    const results = await searchClient(client, { telefono, email });

    const clientes = results.map((c) => ({
      cod_cli: c.cod_cli,
      nombre: c.nombre,
      apellidos: c.apellidos,
      nif: c.nif,
      telefono1: c.telefono1,
      email: c.email,
    }));

    return NextResponse.json({ clientes });
  } catch (err) {
    console.error("[buscar-comprador] Inmovilla search error:", err);
    return NextResponse.json(
      { error: "Error al buscar en Inmovilla" },
      { status: 502 },
    );
  }
}

export const GET = withObservedRoute(
  { method: "GET", route: "/api/operaciones/[id]/buscar-comprador" },
  getHandler,
);
