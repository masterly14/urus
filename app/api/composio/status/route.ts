import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { checkCalendarHealth } from "@/lib/composio/calendar";

/**
 * GET /api/composio/status?comercialId=xxx
 *
 * Devuelve el estado de conexión del calendario de un comercial.
 * Response:
 *   { connected: false }
 *   | { connected: true, connectedAt, calendarProvider, healthy }
 *
 * Mock mode: ?mock=1 devuelve una conexión ficticia activa.
 */
const getHandler = async (request: Request) => {
  const url = new URL(request.url);
  const isMock = url.searchParams.get("mock") === "1";

  if (isMock) {
    return NextResponse.json({
      connected: true,
      connectedAt: new Date().toISOString(),
      calendarProvider: "google",
      healthy: true,
    });
  }

  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const comercialId =
    url.searchParams.get("comercialId") ?? session.comercialId;

  if (!comercialId) {
    return NextResponse.json(
      { error: "comercialId requerido" },
      { status: 400 },
    );
  }

  const comercial = await prisma.comercial.findUnique({
    where: { id: comercialId },
    select: {
      composioConnectionId: true,
      composioConnectedAt: true,
      calendarProvider: true,
    },
  });

  if (!comercial || !comercial.composioConnectionId) {
    return NextResponse.json({ connected: false });
  }

  let healthy = false;
  try {
    const healthResult = await checkCalendarHealth(
      comercial.composioConnectionId,
    );
    healthy = healthResult.healthy;
  } catch {
    healthy = false;
  }

  return NextResponse.json({
    connected: true,
    connectedAt: comercial.composioConnectedAt?.toISOString() ?? null,
    calendarProvider: comercial.calendarProvider ?? "google",
    healthy,
  });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/composio/status" },
  getHandler,
);
