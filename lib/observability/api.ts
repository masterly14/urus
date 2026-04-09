import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { runWithObservabilityContext } from "./context";
import { createLogger, ensureObservabilityConsoleInstalled } from "./logger";
import { persistExecutionMetric } from "./persistence";
import type { ExecutionMetricRecord, ObservabilityContext } from "./types";

/**
 * Firma amplia para aceptar handlers de App Router (Request/NextRequest y contexto de params variable).
 */
export type RouteHandler = (
  request: Request,
  context?: unknown,
) => Promise<Response>;

interface ObservedRouteConfig {
  method: string;
  route: string;
}

function buildRouteContext(
  config: ObservedRouteConfig,
  request: Request,
): ObservabilityContext {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const correlationId = request.headers.get("x-correlation-id") ?? undefined;

  return {
    scope: "api",
    source: "api",
    operation: `${config.method} ${config.route}`,
    route: config.route,
    method: config.method,
    requestId,
    correlationId,
  };
}

async function persistRouteMetric(
  context: ObservabilityContext,
  metric: Omit<ExecutionMetricRecord, "scope">,
): Promise<void> {
  await persistExecutionMetric({
    ...metric,
    scope: "api",
    requestId: metric.requestId ?? context.requestId,
    correlationId: metric.correlationId ?? context.correlationId,
    route: metric.route ?? context.route,
    method: metric.method ?? context.method,
  });
}

function withResponseHeaders(
  response: Response,
  context: ObservabilityContext,
): Response {
  const headers = new Headers(response.headers);
  if (context.requestId) {
    headers.set("x-request-id", context.requestId);
  }
  if (context.correlationId) {
    headers.set("x-correlation-id", context.correlationId);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function withObservedRoute(
  config: ObservedRouteConfig,
  handler: RouteHandler,
): RouteHandler {
  return async (request: Request, context?: unknown) => {
    ensureObservabilityConsoleInstalled();

    const startedAt = new Date();
    const routeContext = buildRouteContext(config, request);
    const logger = createLogger(routeContext);

    logger.info("API request started", {
      url: request.url,
    });

    try {
      const response = await runWithObservabilityContext(routeContext, () =>
        handler(request, context),
      );
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();

      logger.info("API request completed", {
        statusCode: response.status,
        durationMs,
      });

      await persistRouteMetric(routeContext, {
        source: routeContext.source,
        operation: routeContext.operation,
        name: `${config.method} ${config.route}`,
        success: response.status < 500,
        startedAt,
        finishedAt,
        durationMs,
        statusCode: response.status,
        throughputCount: 1,
        context: {
          url: request.url,
        },
      });

      return withResponseHeaders(response, routeContext);
    } catch (err) {
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();
      const message = err instanceof Error ? err.message : String(err);

      logger.error("API request failed", err, {
        durationMs,
      });

      await persistRouteMetric(routeContext, {
        source: routeContext.source,
        operation: routeContext.operation,
        name: `${config.method} ${config.route}`,
        success: false,
        startedAt,
        finishedAt,
        durationMs,
        statusCode: 500,
        errorMessage: message,
        context: {
          url: request.url,
        },
      });

      return NextResponse.json(
        { error: "Error interno del servidor", requestId: routeContext.requestId },
        {
          status: 500,
          headers: {
            ...(routeContext.requestId ? { "x-request-id": routeContext.requestId } : {}),
            ...(routeContext.correlationId
              ? { "x-correlation-id": routeContext.correlationId }
              : {}),
          },
        },
      );
    }
  };
}
