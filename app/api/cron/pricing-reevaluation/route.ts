import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/api/cron-auth";
import { scanPropertiesForPricingReevaluation } from "@/lib/pricing/reevaluation-scanner";
import { withObservedRoute } from "@/lib/observability";



const postHandler = async (request: Request) => {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await scanPropertiesForPricingReevaluation();

    console.log(
      `[cron/pricing-reevaluation] scanned=${result.propertiesScanned} ` +
        `cooldown=${result.skippedByCooldown} noLeads=${result.enqueuedNoLeads} ` +
        `visitsNoOffer=${result.enqueuedVisitsNoOffer} errors=${result.errors.length}`,
    );

    return NextResponse.json(result);
  } catch (err) {
    console.error(
      "[cron/pricing-reevaluation] Error:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "Error al evaluar reevaluación de pricing" },
      { status: 500 },
    );
  }
}

export const POST = withObservedRoute({ method: "POST", route: "/api/cron/pricing-reevaluation" }, postHandler);

export const maxDuration = 60;
