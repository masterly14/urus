import { NextResponse } from "next/server";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";
import type {
  ZoneAggregation,
  CompetitorProperty,
  DemandLevel,
  MercadoResponse,
} from "@/lib/pricing/mercado-types";

export const runtime = "nodejs";

function classifyDemand(propCount: number, avgGap: number): DemandLevel {
  if (propCount >= 15 && avgGap <= 0) return "alta";
  if (propCount >= 8 || avgGap <= 3) return "media";
  return "baja";
}

const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const { searchParams } = new URL(request.url);
  const ciudad = searchParams.get("ciudad")?.trim() || undefined;

  const where: Record<string, unknown> = { nodisponible: false };
  if (ciudad) where.ciudad = ciudad;

  const properties = await prisma.propertyCurrent.findMany({
    where,
    select: {
      codigo: true,
      titulo: true,
      precio: true,
      metrosConstruidos: true,
      zona: true,
      ciudad: true,
      fechaAlta: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });

  const reportCodes = properties.map((p) => p.codigo);
  const reports = await prisma.pricingReport.findMany({
    where: { propertyCode: { in: reportCodes } },
    select: {
      propertyCode: true,
      semaforo: true,
      gapPorcentaje: true,
      totalComparables: true,
      comparables: true,
      analyzedAt: true,
    },
  });

  const reportMap = new Map(reports.map((r) => [r.propertyCode, r]));

  // --- Zone aggregation ---
  const zoneMap = new Map<string, {
    precios: number[];
    preciosM2: number[];
    gaps: number[];
    count: number;
    urusCount: number;
  }>();

  for (const prop of properties) {
    const zona = prop.zona || "Sin zona";
    if (!zoneMap.has(zona)) {
      zoneMap.set(zona, { precios: [], preciosM2: [], gaps: [], count: 0, urusCount: 0 });
    }
    const z = zoneMap.get(zona)!;
    z.count++;
    z.urusCount++;

    if (prop.precio > 0) z.precios.push(prop.precio);
    if (prop.precio > 0 && prop.metrosConstruidos > 0) {
      z.preciosM2.push(Math.round(prop.precio / prop.metrosConstruidos));
    }

    const report = reportMap.get(prop.codigo);
    if (report) {
      z.gaps.push(report.gapPorcentaje);

      const comparables = report.comparables as Array<{
        zona?: string;
        precio?: number;
        precioM2?: number;
        metrosConstruidos?: number;
      }> | null;

      if (Array.isArray(comparables)) {
        for (const comp of comparables) {
          if (comp.zona && comp.precioM2 && comp.precioM2 > 0) {
            const compZona = comp.zona || zona;
            if (!zoneMap.has(compZona)) {
              zoneMap.set(compZona, { precios: [], preciosM2: [], gaps: [], count: 0, urusCount: 0 });
            }
            const cz = zoneMap.get(compZona)!;
            cz.count++;
            if (comp.precioM2 > 0) cz.preciosM2.push(comp.precioM2);
            if (comp.precio && comp.precio > 0) cz.precios.push(comp.precio);
          }
        }
      }
    }
  }

  const zones: ZoneAggregation[] = [];
  for (const [zona, data] of zoneMap) {
    if (data.preciosM2.length === 0) continue;

    const precioMedioM2 = Math.round(
      data.preciosM2.reduce((s, v) => s + v, 0) / data.preciosM2.length,
    );
    const precioMedio = data.precios.length > 0
      ? Math.round(data.precios.reduce((s, v) => s + v, 0) / data.precios.length)
      : precioMedioM2 * 80;

    const avgGap = data.gaps.length > 0
      ? data.gaps.reduce((s, v) => s + v, 0) / data.gaps.length
      : 0;

    const tendencia = data.gaps.length > 0 ? -Math.round(avgGap * 10) / 10 : 0;

    zones.push({
      zona,
      precioMedioM2,
      precioMedio,
      propiedades: data.count,
      propiedadesUrus: data.urusCount,
      tendenciaPorcentaje: tendencia,
      demanda: classifyDemand(data.count, avgGap),
    });
  }

  zones.sort((a, b) => b.precioMedioM2 - a.precioMedioM2);

  // --- Competitor properties (URUS portfolio with reports) ---
  const competitors: CompetitorProperty[] = [];
  for (const prop of properties) {
    const report = reportMap.get(prop.codigo);
    if (!report) continue;

    const precioM2 = prop.metrosConstruidos > 0
      ? Math.round(prop.precio / prop.metrosConstruidos)
      : 0;

    let diasPublicado: number | null = null;
    if (prop.fechaAlta) {
      const altaDate = new Date(prop.fechaAlta);
      if (!isNaN(altaDate.getTime())) {
        diasPublicado = Math.max(0, Math.floor(
          (Date.now() - altaDate.getTime()) / (1000 * 60 * 60 * 24),
        ));
      }
    }

    competitors.push({
      propertyCode: prop.codigo,
      titulo: prop.titulo || `Propiedad ${prop.codigo}`,
      precio: prop.precio,
      metros: prop.metrosConstruidos,
      precioM2,
      zona: prop.zona || "Sin zona",
      semaforo: report.semaforo,
      gapPorcentaje: report.gapPorcentaje,
      diasPublicado,
      totalComparables: report.totalComparables,
    });
  }

  competitors.sort((a, b) => Math.abs(b.gapPorcentaje) - Math.abs(a.gapPorcentaje));

  const response: MercadoResponse = {
    zones,
    competitors: competitors.slice(0, 20),
    ciudad: ciudad || "Todas",
    generatedAt: new Date().toISOString(),
  };

  return NextResponse.json(response);
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/pricing/mercado" },
  getHandler,
);
