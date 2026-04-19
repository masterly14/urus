import { NextResponse } from "next/server";
import { Composio } from "@composio/core";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest, unauthorized, forbidden } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";

/**
 * POST /api/composio/connect
 *
 * Inicia el flujo OAuth de Composio para conectar Google Calendar
 * de un comercial. Devuelve la URL de redirección para que el
 * usuario autorice el acceso.
 *
 * Body: { comercialId: string }
 * Response: { redirectUrl: string }
 *
 * Mock mode: ?mock=1 devuelve datos de prueba sin llamar a Composio.
 */
const postHandler = async (request: Request) => {
  const url = new URL(request.url);
  const isMock = url.searchParams.get("mock") === "1";

  if (isMock) {
    return NextResponse.json({
      redirectUrl: `${url.origin}/api/composio/callback?status=success&connected_account_id=mock_ca_123&comercialId=mock_comercial`,
    });
  }

  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const body = await request.json().catch(() => null);
  const comercialId = body?.comercialId;

  if (!comercialId || typeof comercialId !== "string") {
    return NextResponse.json(
      { error: "comercialId es requerido" },
      { status: 400 },
    );
  }

  if (session.role === "comercial" && session.comercialId !== comercialId) {
    return forbidden();
  }

  const comercial = await prisma.comercial.findUnique({
    where: { id: comercialId },
    select: { id: true, nombre: true, composioConnectionId: true },
  });

  if (!comercial) {
    return NextResponse.json(
      { error: "Comercial no encontrado" },
      { status: 404 },
    );
  }

  const composioUserId = `comercial_${comercialId}`;

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? `${url.protocol}//${url.host}`;
  const callbackUrl = `${appUrl}/api/composio/callback?comercialId=${comercialId}`;

  const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
  const composioSession = await composio.create(composioUserId);
  const connectionRequest = await composioSession.authorize("googlecalendar", {
    callbackUrl,
  });

  return NextResponse.json({ redirectUrl: connectionRequest.redirectUrl });
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/composio/connect" },
  postHandler,
);
