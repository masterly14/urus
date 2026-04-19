import { NextResponse } from "next/server";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { getLatestPricingReport } from "@/lib/pricing";
import { withObservedRoute } from "@/lib/observability";


export const runtime = "nodejs";

const getHandler = async (request: Request, context: { params: Promise<{ code: string }> }) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const { code } = await context.params;
  const report = await getLatestPricingReport(code);

  if (!report) {
    return NextResponse.json(
      {
        error: "Informe de pricing no encontrado",
        message: `No existe un informe materializado para ${code}. Ejecuta primero el análisis.`,
      },
      { status: 404 },
    );
  }

  console.log(
    `[pricing/report] lectura property=${code} analyzedAt=${report.analyzedAt} semaforo=${report.stats.semaforo}`,
  );

  return NextResponse.json(report);
}

export const GET = withObservedRoute({ method: "GET", route: "/api/pricing/report/[code]" }, getHandler);
