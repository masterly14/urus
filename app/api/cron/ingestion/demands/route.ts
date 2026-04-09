import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/api/cron-auth";
import { runDemandsIngestionCycle } from "@/lib/workers/ingestion";
import { withObservedRoute } from "@/lib/observability";


const postHandler = async (request: Request) => {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runDemandsIngestionCycle();

  if (result.error) {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}

export const POST = withObservedRoute({ method: "POST", route: "/api/cron/ingestion/demands" }, postHandler);

export const maxDuration = 120;
