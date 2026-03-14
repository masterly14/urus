import { isAuthorized } from "@/lib/api/cron-auth";
import { getWorkersStatusFull, getWorkersStatusMinimal } from "@/lib/workers/status";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  if (isAuthorized(request)) {
    try {
      const data = await getWorkersStatusFull();
      const httpStatus = data.status === "error" ? 503 : 200;
      return NextResponse.json(data, { status: httpStatus });
    } catch (err) {
      console.error("[GET /api/workers/status] full", err);
      return NextResponse.json(
        { status: "error", db: "error", timestamp: new Date().toISOString() },
        { status: 503 },
      );
    }
  }

  try {
    const data = await getWorkersStatusMinimal();
    const httpStatus = data.status === "error" ? 503 : 200;
    return NextResponse.json(data, { status: httpStatus });
  } catch (err) {
    console.error("[GET /api/workers/status] minimal", err);
    return NextResponse.json(
      { status: "error", db: "error", timestamp: new Date().toISOString() },
      { status: 503 },
    );
  }
}
