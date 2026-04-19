import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";
import { appendEvent } from "@/lib/event-store";
import type { JsonValue } from "@/lib/event-store/types";

/**
 * GET /api/composio/callback
 *
 * Callback de Composio tras autorización OAuth exitosa.
 * Composio redirige aquí con query params:
 *   ?status=success|failed
 *   &connected_account_id=ca_xxx
 *   &comercialId=<id>  (nuestro param custom)
 *
 * Persiste el connectionId en Comercial y redirige al usuario
 * a la página de configuración con un mensaje de resultado.
 */
const getHandler = async (request: Request) => {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const connectedAccountId = url.searchParams.get("connected_account_id");
  const comercialId = url.searchParams.get("comercialId");

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? `${url.protocol}//${url.host}`;
  const successRedirect = `${appUrl}/platform/configuracion?calendar=connected`;
  const failRedirect = `${appUrl}/platform/configuracion?calendar=failed`;

  if (status !== "success" || !connectedAccountId) {
    console.warn(
      `[composio/callback] OAuth falló: status=${status} comercialId=${comercialId}`,
    );
    return NextResponse.redirect(failRedirect);
  }

  if (!comercialId) {
    console.warn(
      `[composio/callback] Callback sin comercialId, connectedAccountId=${connectedAccountId}`,
    );
    return NextResponse.redirect(failRedirect);
  }

  const comercial = await prisma.comercial.findUnique({
    where: { id: comercialId },
    select: { id: true, nombre: true },
  });

  if (!comercial) {
    console.warn(
      `[composio/callback] Comercial ${comercialId} no encontrado`,
    );
    return NextResponse.redirect(failRedirect);
  }

  const composioUserId = `comercial_${comercialId}`;

  await prisma.comercial.update({
    where: { id: comercialId },
    data: {
      composioConnectionId: composioUserId,
      composioConnectedAt: new Date(),
      calendarProvider: "google",
    },
  });

  await appendEvent({
    type: "COMPOSIO_CALENDAR_CONNECTED",
    aggregateType: "VISIT_SCHEDULING",
    aggregateId: comercialId,
    payload: {
      comercialId,
      comercialNombre: comercial.nombre,
      composioUserId,
      connectedAccountId,
      calendarProvider: "google",
      connectedAt: new Date().toISOString(),
    } as unknown as JsonValue,
  });

  console.log(
    `[composio/callback] Calendario conectado: comercial=${comercial.nombre} (${comercialId}) composioUserId=${composioUserId}`,
  );

  return NextResponse.redirect(successRedirect);
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/composio/callback" },
  getHandler,
);
