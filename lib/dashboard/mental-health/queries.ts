import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Types — métricas agregadas de salud mental (sin exponer conversaciones)
// ---------------------------------------------------------------------------

export interface FlujoDistribucion {
  bloqueo: number;
  preparacion: number;
  descarga: number;
  enfoque: number;
  crecimiento: number;
}

export interface AlertasActivas {
  energy_drop: number;
  recurrent_block: number;
  overload: number;
}

export interface MentalHealthOverview {
  sesionesUltimos30d: number;
  comercialesActivos: number;
  energiaMediaEquipo: number | null;
  flujoDistribucion: FlujoDistribucion;
  alertasActivas: AlertasActivas;
}

// ---------------------------------------------------------------------------
// Query principal
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getMentalHealthOverview(
  now = new Date(),
): Promise<MentalHealthOverview> {
  const since30d = new Date(now.getTime() - 30 * DAY_MS);

  const [sessionAggs, flujoRows, alertCounts] = await Promise.all([
    // Sesiones totales + comerciales únicos + energía media en 30d
    prisma.$queryRaw<
      { total: number; activos: number; avgEnergia: number | null }[]
    >`
      SELECT
        COUNT(*)::int AS "total",
        COUNT(DISTINCT "comercialId")::int AS "activos",
        ROUND(AVG("nivelEnergia")::numeric, 2)::float AS "avgEnergia"
      FROM "mental_health_sessions"
      WHERE "createdAt" >= ${since30d}
        AND "comercialId" IS NOT NULL
    `,

    // Distribución de flujos (sesiones cerradas en 30d con flujo registrado)
    prisma.$queryRaw<{ flujoActivo: string; count: number }[]>`
      SELECT
        "flujoActivo",
        COUNT(*)::int AS "count"
      FROM "mental_health_sessions"
      WHERE "createdAt" >= ${since30d}
        AND "flujoActivo" IS NOT NULL
        AND "flujoActivo" != 'saludo'
      GROUP BY "flujoActivo"
    `,

    // Alertas activas (no resueltas) de los 3 tipos mentales
    prisma.dashboardAlert.groupBy({
      by: ["type"],
      where: {
        type: { in: ["energy_drop", "recurrent_block", "overload"] },
        resolvedAt: null,
      },
      _count: { id: true },
    }),
  ]);

  const agg = sessionAggs[0] ?? { total: 0, activos: 0, avgEnergia: null };

  const flujoMap: Record<string, number> = {};
  for (const row of flujoRows) {
    if (row.flujoActivo) flujoMap[row.flujoActivo] = row.count;
  }

  const alertMap: Record<string, number> = {};
  for (const row of alertCounts) {
    alertMap[row.type] = row._count.id;
  }

  return {
    sesionesUltimos30d: agg.total,
    comercialesActivos: agg.activos,
    energiaMediaEquipo: agg.avgEnergia ?? null,
    flujoDistribucion: {
      bloqueo: flujoMap["bloqueo"] ?? 0,
      preparacion: flujoMap["preparacion"] ?? 0,
      descarga: flujoMap["descarga"] ?? 0,
      enfoque: flujoMap["enfoque"] ?? 0,
      crecimiento: flujoMap["crecimiento"] ?? 0,
    },
    alertasActivas: {
      energy_drop: alertMap["energy_drop"] ?? 0,
      recurrent_block: alertMap["recurrent_block"] ?? 0,
      overload: alertMap["overload"] ?? 0,
    },
  };
}
