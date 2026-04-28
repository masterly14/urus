import { NextResponse } from "next/server";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { getCachedPricingReport } from "@/lib/pricing/cached-queries";
import { withObservedRoute } from "@/lib/observability";


export const runtime = "nodejs";

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

async function probeImageUrl(url: string): Promise<Record<string, unknown>> {
  const host = hostOf(url);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Range: "bytes=0-0",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
      redirect: "manual",
    });
    return {
      host,
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type"),
      contentLength: response.headers.get("content-length"),
      locationHost: response.headers.get("location") ? hostOf(response.headers.get("location")!) : null,
    };
  } catch (err) {
    return {
      host,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

const getHandler = async (request: Request, context: { params: Promise<{ code: string }> }) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const { code } = await context.params;
  const report = await getCachedPricingReport(code);

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
  // #region agent log
  fetch("http://127.0.0.1:7478/ingest/3a86774c-7051-4ca6-b6e8-a92160972b21", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "bfe3e0" }, body: JSON.stringify({ sessionId: "bfe3e0", runId: "initial", hypothesisId: "H4", location: "app/api/pricing/report/[code]/route.ts:getHandler", message: "Persisted pricing report image counts", data: { propertyCode: code, analyzedAt: report.analyzedAt, comparableCount: report.comparables.length, withFotosCount: report.comparables.filter((c) => Array.isArray(c.fotos) && c.fotos.length > 0).length, sampleFotoCounts: report.comparables.slice(0, 5).map((c) => ({ statefoxId: c.statefoxId, fotosCount: Array.isArray(c.fotos) ? c.fotos.length : null })) }, timestamp: Date.now() }) }).catch(() => {});
  // #endregion
  const firstImageUrl = report.comparables.find((c) => Array.isArray(c.fotos) && c.fotos.length > 0)?.fotos[0];
  if (firstImageUrl) {
    const probe = await probeImageUrl(firstImageUrl);
    // #region agent log
    fetch("http://127.0.0.1:7478/ingest/3a86774c-7051-4ca6-b6e8-a92160972b21", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "bfe3e0" }, body: JSON.stringify({ sessionId: "bfe3e0", runId: "initial", hypothesisId: "H5,H6,H7", location: "app/api/pricing/report/[code]/route.ts:probeImageUrl", message: "Server-side probe of first comparable image", data: { propertyCode: code, probe }, timestamp: Date.now() }) }).catch(() => {});
    // #endregion
  }

  return NextResponse.json(report);
}

export const GET = withObservedRoute({ method: "GET", route: "/api/pricing/report/[code]" }, getHandler);
