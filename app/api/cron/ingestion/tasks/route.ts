import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/api/cron-auth";
import { runTasksIngestionCycle } from "@/lib/workers/ingestion/tasks";
import { withObservedRoute } from "@/lib/observability";

const postHandler = async (request: Request) => {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runTasksIngestionCycle();

  if (result.error) {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/cron/ingestion/tasks" },
  postHandler,
);

export const maxDuration = 120;
