import { NextResponse } from "next/server";
import {
  getComercialesDashboard,
  getComercialDashboardDetail,
  getDefaultDashboardRange,
  getLeadScoreStatsByComercial,
} from "@/lib/dashboard/comercial/queries";
import {
  classifyComercial,
  computeTeamAverages,
  getClassifyConfig,
  type ClassificationResult,
  type LeadScoreStats,
} from "@/lib/dashboard/comercial/classify";
import { getSession } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";


function parseIsoDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

const getHandler = async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id: comercialId } = await context.params;
  const session = getSession(request);

  if (
    session.role === "comercial" &&
    session.comercialId &&
    session.comercialId !== comercialId
  ) {
    return NextResponse.json(
      { error: "No tienes permiso para ver este comercial" },
      { status: 403 },
    );
  }

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

  try {
    const [detailResult, teamResult, leadScoreRows] = await Promise.all([
      getComercialDashboardDetail(comercialId, range),
      getComercialesDashboard(range),
      getLeadScoreStatsByComercial(range),
    ]);

    let classification: Pick<ClassificationResult, "profile" | "confidence"> | null = null;

    if (detailResult.summary) {
      const config = getClassifyConfig();
      const teamAvg = computeTeamAverages(teamResult.rows, config.minLeads);
      const leadStats = leadScoreRows.find(
        (r: LeadScoreStats) => r.comercialId === comercialId,
      );
      const result = classifyComercial(
        detailResult.summary,
        teamAvg,
        leadStats,
        config,
      );
      classification = { profile: result.profile, confidence: result.confidence };
    }

    return NextResponse.json({
      ok: true,
      ...detailResult,
      classification,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/dashboard/comercial/:id] Error:", message);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}

export const GET = withObservedRoute({ method: "GET", route: "/api/dashboard/comercial/[id]" }, getHandler);
