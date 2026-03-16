import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/api/cron-auth";
import { runDemandsIngestionCycle } from "@/lib/workers/ingestion";

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runDemandsIngestionCycle();

  if (result.error) {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}

export const maxDuration = 120;
