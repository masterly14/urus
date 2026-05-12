import { NextResponse } from "next/server";
import { Composio } from "@composio/core";
import { OpenAIAgentsProvider } from "@composio/openai-agents";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { withObservedRoute, persistExecutionMetric } from "@/lib/observability";
import { alertGeneric } from "@/lib/alerts";
import {
  ComposioGmailNotConnectedError,
  getActiveGmailConnection,
} from "@/lib/composio/gmail-connection";

/**
 * Health check proactivo de la conexión Gmail en Composio que alimenta el
 * flujo 2FA de Inmovilla.
 *
 * Programar como cron diario (Upstash QStash). Si la conexión deja de estar
 * `ACTIVE`, dispara una alerta crítica accionable antes de que el siguiente
 * login 2FA falle en producción.
 */
const postHandler = async (request: Request) => {
  if (!(await isQstashAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();
  const userId = process.env.COMPOSIO_USER_ID ?? "default";
  const expectedConnectionId =
    process.env.COMPOSIO_GMAIL_CONNECTED_ACCOUNT_ID?.trim() || null;

  if (!process.env.COMPOSIO_API_KEY) {
    return NextResponse.json(
      { error: "COMPOSIO_API_KEY no configurada" },
      { status: 500 },
    );
  }

  const composio = new Composio({
    apiKey: process.env.COMPOSIO_API_KEY,
    provider: new OpenAIAgentsProvider(),
  });

  try {
    const connection = await getActiveGmailConnection(composio, userId);
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();

    await persistExecutionMetric({
      scope: "worker",
      source: "worker",
      operation: "composio:gmail:health",
      name: "composio_gmail_health",
      success: true,
      startedAt,
      finishedAt,
      durationMs,
      throughputCount: 1,
      context: {
        userId,
        connectedAccountId: connection.id,
        status: connection.status,
        toolkitSlug: connection.toolkitSlug,
        expectedConnectionId,
      },
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      userId,
      connectedAccountId: connection.id,
      status: connection.status,
    });
  } catch (err) {
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    const isConnError = err instanceof ComposioGmailNotConnectedError;
    const message = err instanceof Error ? err.message : String(err);

    alertGeneric(
      "Composio Gmail health check: la conexión 2FA no está ACTIVE",
      "critical",
      {
        userId,
        expectedConnectionId,
        observedStatus: isConnError ? err.observedStatus : "ERROR",
        error: message,
        recommendation:
          "Reautoriza Gmail en https://app.composio.dev y verifica COMPOSIO_GMAIL_CONNECTED_ACCOUNT_ID",
      },
    ).catch(() => {});

    await persistExecutionMetric({
      scope: "worker",
      source: "worker",
      operation: "composio:gmail:health",
      name: "composio_gmail_health",
      success: false,
      startedAt,
      finishedAt,
      durationMs,
      throughputCount: 0,
      errorMessage: message,
      errorCode: isConnError ? err.code : "UNKNOWN",
      context: {
        userId,
        expectedConnectionId,
        observedStatus: isConnError ? err.observedStatus : undefined,
      },
    }).catch(() => {});

    return NextResponse.json(
      {
        ok: false,
        error: message,
        errorCode: isConnError ? err.code : "UNKNOWN",
        userId,
        expectedConnectionId,
      },
      { status: 503 },
    );
  }
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/cron/composio-gmail-health" },
  postHandler,
);

export const maxDuration = 60;
