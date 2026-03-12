import { NextResponse } from "next/server";
import { runDemandsIngestionCycle } from "@/lib/workers/ingestion";

function isAuthorized(request: Request): boolean {
  const token = process.env.CRON_SECRET;
  if (!token) return false;

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${token}`) return true;

  const url = new URL(request.url);
  return url.searchParams.get("token") === token;
}

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
