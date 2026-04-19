import { prisma } from "@/lib/prisma";
import {
  getCommissionRate,
  getLeadNoFollowUpThresholdHours,
  type DashboardDateRange,
  getDefaultDashboardRange,
} from "@/lib/dashboard/comercial/queries";
import type { CeoCityRow, CeoCityPerformancePayload } from "./types";
import { CIUDADES_OPERATIVAS } from "./types";

interface RawCityRow {
  ciudad: string;
  comercialesActivos: number;
  cargaMedia: number;
  capacidadOciosa: number;
  propiedadesActivas: number;
  operacionesMes: number;
  facturacionMes: number;
  ticketMedio: number;
  leadsAsignados: number;
  leadsPerdidos: number;
  revenuePerLead: number;
}

export async function getCeoCityPerformance(
  range?: DashboardDateRange,
): Promise<CeoCityPerformancePayload> {
  const r = range ?? getDefaultDashboardRange();
  const commissionRate = getCommissionRate();
  const thresholdHours = getLeadNoFollowUpThresholdHours();
  const leadCutoff = new Date(r.to.getTime() - thresholdHours * 60 * 60 * 1000);

  const ciudades = [...CIUDADES_OPERATIVAS];

  const rows = await prisma.$queryRaw<RawCityRow[]>`
    WITH city_comerciales AS (
      SELECT
        ciudad,
        COUNT(*)::int AS "comercialesActivos",
        COALESCE(AVG("cargaActual"), 0)::float8 AS "cargaMedia",
        COALESCE(SUM("cargaMaxima" - "cargaActual"), 0)::float8 AS "capacidadOciosa"
      FROM "comerciales"
      WHERE activo = true
        AND ciudad = ANY(${ciudades})
      GROUP BY ciudad
    ),
    city_properties AS (
      SELECT
        ciudad,
        COUNT(*)::int AS "propiedadesActivas"
      FROM "properties_current"
      WHERE nodisponible = false
        AND estado NOT IN ('Vendido', 'Alquilado', 'Traspasado', 'Retirado')
        AND ciudad = ANY(${ciudades})
      GROUP BY ciudad
    ),
    city_operations AS (
      SELECT
        ciudad,
        COUNT(*)::int AS "operacionesMes",
        COALESCE(SUM(COALESCE("grossAmountEur", 0) * ${commissionRate}), 0)::float8 AS "facturacionMes",
        CASE
          WHEN COUNT(*) > 0
            THEN (COALESCE(SUM(COALESCE("grossAmountEur", 0) * ${commissionRate}), 0) / COUNT(*))::float8
          ELSE 0
        END AS "ticketMedio"
      FROM "commercial_operation_facts"
      WHERE "closedAt" >= ${r.from}
        AND "closedAt" < ${r.to}
        AND ciudad = ANY(${ciudades})
      GROUP BY ciudad
    ),
    city_leads AS (
      SELECT
        ciudad,
        COUNT(*)::int AS "leadsAsignados",
        COUNT(*) FILTER (
          WHERE "contactedAt" IS NULL
            AND "createdAt" < ${leadCutoff}
        )::int AS "leadsPerdidos",
        CASE
          WHEN COUNT(*) > 0
            THEN (
              COALESCE(
                (SELECT SUM(COALESCE(o2."grossAmountEur", 0) * ${commissionRate})
                 FROM "commercial_operation_facts" o2
                 WHERE o2."closedAt" >= ${r.from}
                   AND o2."closedAt" < ${r.to}
                   AND o2.ciudad = clf.ciudad
                ), 0
              ) / COUNT(*)
            )::float8
          ELSE 0
        END AS "revenuePerLead"
      FROM "commercial_lead_facts" clf
      WHERE "assignedComercialId" IS NOT NULL
        AND "createdAt" >= ${r.from}
        AND "createdAt" < ${r.to}
        AND ciudad = ANY(${ciudades})
      GROUP BY ciudad
    )
    SELECT
      c.ciudad,
      COALESCE(c."comercialesActivos", 0)::int AS "comercialesActivos",
      COALESCE(c."cargaMedia", 0)::float8 AS "cargaMedia",
      COALESCE(c."capacidadOciosa", 0)::float8 AS "capacidadOciosa",
      COALESCE(p."propiedadesActivas", 0)::int AS "propiedadesActivas",
      COALESCE(o."operacionesMes", 0)::int AS "operacionesMes",
      COALESCE(o."facturacionMes", 0)::float8 AS "facturacionMes",
      COALESCE(o."ticketMedio", 0)::float8 AS "ticketMedio",
      COALESCE(l."leadsAsignados", 0)::int AS "leadsAsignados",
      COALESCE(l."leadsPerdidos", 0)::int AS "leadsPerdidos",
      COALESCE(l."revenuePerLead", 0)::float8 AS "revenuePerLead"
    FROM city_comerciales c
    LEFT JOIN city_properties p ON p.ciudad = c.ciudad
    LEFT JOIN city_operations o ON o.ciudad = c.ciudad
    LEFT JOIN city_leads l ON l.ciudad = c.ciudad
    ORDER BY c.ciudad;
  `;

  const cities: CeoCityRow[] = CIUDADES_OPERATIVAS.map((ciudad) => {
    const raw = rows.find((r) => r.ciudad === ciudad);
    if (!raw) {
      return {
        ciudad,
        comercialesActivos: 0,
        cargaMedia: 0,
        propiedadesActivas: 0,
        operacionesMes: 0,
        facturacionMes: 0,
        rentabilidadPorComercial: 0,
        costeOportunidadLeadsPerdidos: 0,
        costeOportunidadCapacidadOciosa: 0,
        costeOportunidadTotal: 0,
        leadsAsignados: 0,
        leadsPerdidos: 0,
        ticketMedio: 0,
        capacidadOciosa: 0,
        revenuePerLead: 0,
      };
    }

    const rentabilidadPorComercial =
      raw.comercialesActivos > 0
        ? raw.facturacionMes / raw.comercialesActivos
        : 0;

    const costeOportunidadLeadsPerdidos = raw.leadsPerdidos * raw.ticketMedio;
    const costeOportunidadCapacidadOciosa =
      raw.capacidadOciosa * raw.revenuePerLead;
    const costeOportunidadTotal =
      costeOportunidadLeadsPerdidos + costeOportunidadCapacidadOciosa;

    return {
      ciudad: raw.ciudad,
      comercialesActivos: raw.comercialesActivos,
      cargaMedia: raw.cargaMedia,
      propiedadesActivas: raw.propiedadesActivas,
      operacionesMes: raw.operacionesMes,
      facturacionMes: raw.facturacionMes,
      rentabilidadPorComercial,
      costeOportunidadLeadsPerdidos,
      costeOportunidadCapacidadOciosa,
      costeOportunidadTotal,
      leadsAsignados: raw.leadsAsignados,
      leadsPerdidos: raw.leadsPerdidos,
      ticketMedio: raw.ticketMedio,
      capacidadOciosa: raw.capacidadOciosa,
      revenuePerLead: raw.revenuePerLead,
    };
  });

  return {
    cities,
    range: { from: r.from.toISOString(), to: r.to.toISOString() },
    commissionRate,
  };
}
