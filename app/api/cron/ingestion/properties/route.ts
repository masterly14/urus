import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/api/cron-auth";
import { runPropertiesIngestionCycle } from "@/lib/workers/ingestion";
import { withObservedRoute } from "@/lib/observability";


const postHandler = async (request: Request) => {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runPropertiesIngestionCycle();

  if (result.error) {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}

export const POST = withObservedRoute({ method: "POST", route: "/api/cron/ingestion/properties" }, postHandler);

// With 13s per REST request and N properties, large catalogues can take >2min.
// Vercel Pro allows up to 300s; set to max to avoid premature timeout.
export const maxDuration = 300;
