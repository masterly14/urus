import { prisma } from "@/lib/prisma";
import { listColaboradores, type ColaboradorListRow } from "./queries";
import { classifyAll, type ClassifiedColaborador, type ColaboradorClasificacion } from "./classify";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ColaboradorDashboardRow = ClassifiedColaborador & {
  facturacionVinculadaEur: number;
  operacionesVinculadasCount: number;
};

export type TipoMetricas = {
  tipo: string;
  totalColaboradores: number;
  avgSlaCumplimiento: number;
  avgDiasHito: number | null;
  hitosVencidos: number;
  facturacionVinculadaEur: number;
};

export type DashboardResumen = {
  totalActivos: number;
  slaCumplimientoGlobal: number;
  hitosVencidosTotales: number;
  facturacionTotal: number;
  distribucionClasificacion: Record<ColaboradorClasificacion, number>;
};

export type DashboardColaboradoresPayload = {
  resumen: DashboardResumen;
  ranking: ColaboradorDashboardRow[];
  metricasPorTipo: TipoMetricas[];
};

// ---------------------------------------------------------------------------
// Facturacion vinculada por colaborador
// ---------------------------------------------------------------------------

type FacturacionRow = {
  colaboradorId: string;
  totalEur: number;
  opsCount: number;
};

async function getFacturacionPorColaborador(): Promise<Map<string, FacturacionRow>> {
  const rows = await prisma.$queryRaw<FacturacionRow[]>`
    SELECT
      ca."colaboradorId" AS "colaboradorId",
      COALESCE(SUM(cof."grossAmountEur"), 0)::float8 AS "totalEur",
      COUNT(DISTINCT cof.id)::int AS "opsCount"
    FROM "colaborador_asignaciones" ca
    INNER JOIN "commercial_operation_facts" cof
      ON cof."operacionId" = ca."operacionId"
      AND cof."operacionId" IS NOT NULL
    GROUP BY ca."colaboradorId"
  `;

  return new Map(rows.map((r) => [r.colaboradorId, r]));
}

// ---------------------------------------------------------------------------
// Dashboard principal
// ---------------------------------------------------------------------------

export async function getDashboardColaboradores(): Promise<DashboardColaboradoresPayload> {
  const [baseRows, facturacionMap] = await Promise.all([
    listColaboradores({ activo: true }),
    getFacturacionPorColaborador(),
  ]);

  const classified = classifyAll(baseRows);

  const ranking: ColaboradorDashboardRow[] = classified.map((c) => {
    const fact = facturacionMap.get(c.id);
    return {
      ...c,
      facturacionVinculadaEur: fact?.totalEur ?? 0,
      operacionesVinculadasCount: fact?.opsCount ?? 0,
    };
  });

  ranking.sort((a, b) => b.facturacionVinculadaEur - a.facturacionVinculadaEur);

  const resumen = computeResumen(ranking);
  const metricasPorTipo = computeMetricasPorTipo(ranking);

  return { resumen, ranking, metricasPorTipo };
}

// ---------------------------------------------------------------------------
// Resumen global
// ---------------------------------------------------------------------------

function computeResumen(rows: ColaboradorDashboardRow[]): DashboardResumen {
  const distribucion: Record<ColaboradorClasificacion, number> = {
    partner_estrategico: 0,
    funcional: 0,
    lento: 0,
    critico: 0,
    sin_datos: 0,
  };

  let slaSum = 0;
  let hitosVencidos = 0;
  let facturacion = 0;

  for (const r of rows) {
    distribucion[r.clasificacion.clasificacion]++;
    slaSum += r.slaCumplimiento;
    hitosVencidos += r.hitosVencidos;
    facturacion += r.facturacionVinculadaEur;
  }

  return {
    totalActivos: rows.length,
    slaCumplimientoGlobal: rows.length > 0
      ? Math.round((slaSum / rows.length) * 10) / 10
      : 0,
    hitosVencidosTotales: hitosVencidos,
    facturacionTotal: Math.round(facturacion * 100) / 100,
    distribucionClasificacion: distribucion,
  };
}

// ---------------------------------------------------------------------------
// Metricas por tipo
// ---------------------------------------------------------------------------

function computeMetricasPorTipo(rows: ColaboradorDashboardRow[]): TipoMetricas[] {
  const tipoMap = new Map<string, ColaboradorDashboardRow[]>();

  for (const r of rows) {
    if (!r.tipo) continue;
    const list = tipoMap.get(r.tipo) ?? [];
    list.push(r);
    tipoMap.set(r.tipo, list);
  }

  const result: TipoMetricas[] = [];

  for (const [tipo, group] of tipoMap) {
    const avgSla = group.reduce((s, r) => s + r.slaCumplimiento, 0) / group.length;

    const diasValues = group
      .map((r) => r.avgDiasHito)
      .filter((d): d is number => d !== null);
    const avgDias = diasValues.length > 0
      ? diasValues.reduce((a, b) => a + b, 0) / diasValues.length
      : null;

    result.push({
      tipo,
      totalColaboradores: group.length,
      avgSlaCumplimiento: Math.round(avgSla * 10) / 10,
      avgDiasHito: avgDias !== null ? Math.round(avgDias * 10) / 10 : null,
      hitosVencidos: group.reduce((s, r) => s + r.hitosVencidos, 0),
      facturacionVinculadaEur: Math.round(
        group.reduce((s, r) => s + r.facturacionVinculadaEur, 0) * 100,
      ) / 100,
    });
  }

  result.sort((a, b) => b.facturacionVinculadaEur - a.facturacionVinculadaEur);
  return result;
}
