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

export type NivelEstresReal = "bajo" | "medio" | "alto";

export interface ComercialCoachStats {
  comercialId: string;
  nombre: string;
  ciudad: string;
  avatar: string;
  sesiones30d: number;
  ultimaSesion: string | null;
  nivelEnergiaMedio: number | null;
  nivelEstres: NivelEstresReal;
  flujoMasFrecuente: string | null;
}

export interface WeeklyUsageDay {
  day: string;
  sessions: number;
}

export interface CoachDashboardData {
  overview: MentalHealthOverview;
  comerciales: ComercialCoachStats[];
  weeklyUsage: WeeklyUsageDay[];
}

// ---------------------------------------------------------------------------
// Query principal (overview)
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getMentalHealthOverview(
  now = new Date(),
): Promise<MentalHealthOverview> {
  const since30d = new Date(now.getTime() - 30 * DAY_MS);

  const [sessionAggs, flujoRows, alertCounts] = await Promise.all([
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

// ---------------------------------------------------------------------------
// Per-comercial coach stats (30d)
// ---------------------------------------------------------------------------

function energiaToEstres(avg: number | null): NivelEstresReal {
  if (avg === null) return "medio";
  if (avg >= 4) return "bajo";
  if (avg >= 2.5) return "medio";
  return "alto";
}

function initialsFromNombre(nombre: string): string {
  return nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export async function getComercialCoachStats(
  now = new Date(),
): Promise<ComercialCoachStats[]> {
  const since30d = new Date(now.getTime() - 30 * DAY_MS);

  const rows = await prisma.$queryRaw<
    {
      comercialId: string;
      sesiones: number;
      ultimaSesion: Date | null;
      avgEnergia: number | null;
      flujoTop: string | null;
    }[]
  >`
    SELECT
      s."comercialId",
      COUNT(*)::int                                AS "sesiones",
      MAX(s."createdAt")                           AS "ultimaSesion",
      ROUND(AVG(s."nivelEnergia")::numeric, 2)::float AS "avgEnergia",
      (
        SELECT ss."flujoActivo"
        FROM "mental_health_sessions" ss
        WHERE ss."comercialId" = s."comercialId"
          AND ss."createdAt" >= ${since30d}
          AND ss."flujoActivo" IS NOT NULL
          AND ss."flujoActivo" != 'saludo'
        GROUP BY ss."flujoActivo"
        ORDER BY COUNT(*) DESC
        LIMIT 1
      ) AS "flujoTop"
    FROM "mental_health_sessions" s
    WHERE s."createdAt" >= ${since30d}
      AND s."comercialId" IS NOT NULL
    GROUP BY s."comercialId"
    ORDER BY "sesiones" DESC
  `;

  const comercialIds = rows.map((r) => r.comercialId);
  const comerciales = await prisma.comercial.findMany({
    where: { id: { in: comercialIds } },
    select: { id: true, nombre: true, ciudad: true },
  });
  const map = new Map(comerciales.map((c) => [c.id, c]));

  return rows.map((r) => {
    const c = map.get(r.comercialId);
    const nombre = c?.nombre ?? r.comercialId;
    return {
      comercialId: r.comercialId,
      nombre,
      ciudad: c?.ciudad ?? "",
      avatar: initialsFromNombre(nombre),
      sesiones30d: r.sesiones,
      ultimaSesion: r.ultimaSesion?.toISOString() ?? null,
      nivelEnergiaMedio: r.avgEnergia,
      nivelEstres: energiaToEstres(r.avgEnergia),
      flujoMasFrecuente: r.flujoTop,
    };
  });
}

// ---------------------------------------------------------------------------
// Weekly usage (last 7 days, by day-of-week)
// ---------------------------------------------------------------------------

const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export async function getWeeklyUsage(
  now = new Date(),
): Promise<WeeklyUsageDay[]> {
  const since7d = new Date(now.getTime() - 7 * DAY_MS);

  const rows = await prisma.$queryRaw<{ dow: number; count: number }[]>`
    SELECT
      EXTRACT(DOW FROM "createdAt")::int AS "dow",
      COUNT(*)::int AS "count"
    FROM "mental_health_sessions"
    WHERE "createdAt" >= ${since7d}
    GROUP BY EXTRACT(DOW FROM "createdAt")
    ORDER BY "dow"
  `;

  const countByDow = new Map(rows.map((r) => [r.dow, r.count]));

  return [1, 2, 3, 4, 5, 6, 0].map((dow) => ({
    day: DAY_LABELS[dow],
    sessions: countByDow.get(dow) ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Full dashboard payload
// ---------------------------------------------------------------------------

export async function getCoachDashboardData(
  now = new Date(),
): Promise<CoachDashboardData> {
  const [overview, comerciales, weeklyUsage] = await Promise.all([
    getMentalHealthOverview(now),
    getComercialCoachStats(now),
    getWeeklyUsage(now),
  ]);
  return { overview, comerciales, weeklyUsage };
}
