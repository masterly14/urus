import { NextResponse } from "next/server";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";
import type {
  ZonePropertyDetail,
  ZoneDetailResponse,
} from "@/lib/pricing/mercado-types";

export const runtime = "nodejs";

type SemaforoValue = ZonePropertyDetail["semaforo"];

function normalizeSemaforo(value: string | null | undefined): SemaforoValue {
  if (!value) return null;
  if (value === "verde" || value === "amarillo" || value === "rojo" || value === "sin_datos") {
    return value;
  }
  return null;
}

const getHandler = async (
  request: Request,
  context: { params: Promise<{ zona: string }> },
) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const { zona: rawZona } = await context.params;
  const zona = decodeURIComponent(rawZona).trim();
  if (!zona) {
    return NextResponse.json({ error: "Zona vacía" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const ciudad = searchParams.get("ciudad")?.trim() || undefined;

  const where: Record<string, unknown> = {
    nodisponible: false,
    zona,
  };
  if (ciudad) where.ciudad = ciudad;

  const properties = await prisma.propertyCurrent.findMany({
    where,
    select: {
      codigo: true,
      titulo: true,
      precio: true,
      metrosConstruidos: true,
      habitaciones: true,
      banyos: true,
      ciudad: true,
      zona: true,
      estado: true,
      mainPhotoUrl: true,
      numFotos: true,
      portalUrl: true,
      portalName: true,
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 60,
  });

  const codigos = properties.map((p) => p.codigo);
  const reports = codigos.length
    ? await prisma.pricingReport.findMany({
        where: { propertyCode: { in: codigos } },
        select: {
          propertyCode: true,
          semaforo: true,
          gapPorcentaje: true,
          analyzedAt: true,
        },
      })
    : [];

  const reportMap = new Map(reports.map((r) => [r.propertyCode, r]));

  const details: ZonePropertyDetail[] = properties.map((prop) => {
    const precioM2 =
      prop.metrosConstruidos > 0 && prop.precio > 0
        ? Math.round(prop.precio / prop.metrosConstruidos)
        : 0;
    const report = reportMap.get(prop.codigo);

    return {
      codigo: prop.codigo,
      titulo: prop.titulo || `Propiedad ${prop.codigo}`,
      precio: prop.precio,
      metrosConstruidos: prop.metrosConstruidos,
      precioM2,
      habitaciones: prop.habitaciones,
      banyos: prop.banyos,
      ciudad: prop.ciudad,
      zona: prop.zona,
      estado: prop.estado,
      mainPhotoUrl: prop.mainPhotoUrl ?? null,
      numFotos: prop.numFotos,
      portalUrl: prop.portalUrl ?? null,
      portalName: prop.portalName ?? null,
      semaforo: normalizeSemaforo(report?.semaforo),
      gapPorcentaje: report?.gapPorcentaje ?? null,
      analyzedAt: report?.analyzedAt ? report.analyzedAt.toISOString() : null,
    };
  });

  const response: ZoneDetailResponse = {
    zona,
    totalUrus: details.length,
    properties: details,
    generatedAt: new Date().toISOString(),
  };

  return NextResponse.json(response);
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/pricing/mercado/zona/[zona]" },
  getHandler,
);
