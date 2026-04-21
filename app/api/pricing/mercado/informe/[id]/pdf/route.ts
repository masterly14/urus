import { NextResponse } from "next/server";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { getMarketReportById } from "@/lib/pricing/market-report-repo";
import { generateMarketReportPdf } from "@/lib/pricing/market-report-pdf";

export const runtime = "nodejs";

const getHandler = async (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const { id } = await context.params;
  const record = await getMarketReportById(id);

  if (!record) {
    return NextResponse.json(
      { error: "Informe no encontrado." },
      { status: 404 },
    );
  }

  const pdfBuffer = await generateMarketReportPdf(record);

  const filename = `informe-mercado-${record.ciudad.toLowerCase().replace(/\s+/g, "-")}-${new Date(record.generatedAt).toISOString().slice(0, 10)}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(pdfBuffer.length),
    },
  });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/pricing/mercado/informe/[id]/pdf" },
  getHandler,
);
