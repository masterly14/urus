import { NextResponse } from "next/server";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";


export const runtime = "nodejs";

const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const { searchParams } = new URL(request.url);
  const ciudad = searchParams.get("ciudad")?.trim() || undefined;
  const estado = searchParams.get("estado")?.trim() || undefined;

  const where: Record<string, unknown> = { nodisponible: false };
  if (ciudad) where.ciudad = ciudad;
  if (estado) where.estado = estado;

  const properties = await prisma.propertyCurrent.findMany({
    where,
    select: {
      codigo: true,
      ref: true,
      titulo: true,
      tipoOfer: true,
      precio: true,
      metrosConstruidos: true,
      habitaciones: true,
      banyos: true,
      ciudad: true,
      zona: true,
      estado: true,
      numFotos: true,
      agente: true,
      fechaAlta: true,
      mainPhotoUrl: true,
      portalUrl: true,
      portalName: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ properties });
}

export const GET = withObservedRoute({ method: "GET", route: "/api/pricing/properties" }, getHandler);
