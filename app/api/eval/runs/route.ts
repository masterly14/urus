import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getSessionFromRequest, isCeoOrAdmin, unauthorized, forbidden } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";


const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  const [runs, total] = await Promise.all([
    prisma.evalRun.findMany({
      orderBy: { startedAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        name: true,
        agentVersion: true,
        model: true,
        scenarioCount: true,
        avgScore: true,
        status: true,
        startedAt: true,
        completedAt: true,
      },
    }),
    prisma.evalRun.count(),
  ]);

  return NextResponse.json({ runs, total, limit, offset });
}

export const GET = withObservedRoute({ method: "GET", route: "/api/eval/runs" }, getHandler);
