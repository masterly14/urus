import { NextResponse } from "next/server";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { getCachedPricingProperties } from "@/lib/pricing/cached-queries";
import { withObservedRoute } from "@/lib/observability";


export const runtime = "nodejs";

const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const { searchParams } = new URL(request.url);
  const ciudad = searchParams.get("ciudad")?.trim() || undefined;
  const estado = searchParams.get("estado")?.trim() || undefined;

  const properties = await getCachedPricingProperties(ciudad, estado);

  return NextResponse.json({ properties });
};

export const GET = withObservedRoute({ method: "GET", route: "/api/pricing/properties" }, getHandler);
