import { NextResponse } from "next/server";
import {
  getComercialesDashboard,
  getDefaultDashboardRange,
  getLeadScoreStatsByComercial,
} from "@/lib/dashboard/comercial/queries";
import {
  classifyTeam,
  type ClassifiedRow,
  type LeadScoreStats,
} from "@/lib/dashboard/comercial/classify";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";

function parseIsoDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

async function persistClassifications(
  classified: ClassifiedRow[],
  range: { from: Date; to: Date },
): Promise<void> {
  try {
    const data = classified
      .filter((r) => r.classification.profile !== "sin_datos_suficientes")
      .map((r) => ({
        comercialId: r.comercialId,
        rangeFrom: range.from,
        rangeTo: range.to,
        profile: r.classification.profile,
        confidence: r.classification.confidence,
        profileScores: r.classification.scores as Record<string, number>,
        metricsSnapshot: {
          leadsAssigned: r.leadsAssigned,
          visits: r.visits,
          closings: r.closings,
          conversionLeadToVisit: r.conversionLeadToVisit,
          conversionVisitToClose: r.conversionVisitToClose,
          estimatedRevenueEur: r.estimatedRevenueEur,
          revenuePerLeadAssignedEur: r.revenuePerLeadAssignedEur,
          revenuePerOperationEur: r.revenuePerOperationEur,
          lostLeadRate: r.lostLeadRate,
          avgCloseDays: r.avgCloseDays,
        },
      }));

    if (data.length === 0) return;

    await prisma.$transaction(
      data.map((d) =>
        prisma.commercialClassification.create({ data: d }),
      ),
    );
  } catch (err) {
    console.error(
      "[api/dashboard/comerciales] Classification persistence error (non-blocking):",
      err instanceof Error ? err.message : err,
    );
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  const from = parseIsoDate(url.searchParams.get("from"));
  const to = parseIsoDate(url.searchParams.get("to"));

  const defaultRange = getDefaultDashboardRange();
  const range = {
    from: from ?? defaultRange.from,
    to: to ?? defaultRange.to,
  };

  if (from && to && range.from >= range.to) {
    return NextResponse.json(
      { error: "'from' debe ser menor que 'to'" },
      { status: 400 },
    );
  }

  const includeInactive =
    url.searchParams.get("includeInactive") === "1" ||
    url.searchParams.get("includeInactive") === "true";

  const session = getSession(request);

  try {
    const [dashResult, leadScoreRows] = await Promise.all([
      getComercialesDashboard(range, { includeInactive }),
      getLeadScoreStatsByComercial(range),
    ]);

    const leadScoreMap = new Map<string, LeadScoreStats>(
      leadScoreRows.map((r) => [r.comercialId, r]),
    );

    const classifiedRows = classifyTeam(dashResult.rows, leadScoreMap);

    persistClassifications(classifiedRows, range);

    let filtered = classifiedRows;
    if (session.role === "comercial" && session.comercialId) {
      filtered = classifiedRows.filter(
        (r) => r.comercialId === session.comercialId,
      );
    }

    const rows = filtered.map((r) => ({
      ...r,
      classification: {
        profile: r.classification.profile,
        confidence: r.classification.confidence,
      },
    }));

    return NextResponse.json({
      ok: true,
      rows,
      commissionRate: dashResult.commissionRate,
      range: dashResult.range,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/dashboard/comerciales] Error:", message);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
