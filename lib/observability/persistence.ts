import { randomUUID } from "crypto";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { ExecutionMetricRecord, ObservabilityLogRecord } from "./types";

function toSerializableJson(
  value?: Record<string, unknown>,
): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value ?? {}, (_key, currentValue) => {
      if (typeof currentValue === "bigint") {
        return currentValue.toString();
      }
      if (currentValue instanceof Error) {
        return {
          name: currentValue.name,
          message: currentValue.message,
          stack: currentValue.stack,
        };
      }
      return currentValue;
    }),
  ) as Prisma.InputJsonValue;
}

export async function persistObservabilityLog(
  record: ObservabilityLogRecord,
): Promise<void> {
  try {
    const contextJson = JSON.stringify(toSerializableJson(record.context));
    await prisma.$executeRaw`
      INSERT INTO "observability_logs" (
        "id", "scope", "source", "operation", "level", "message",
        "requestId", "correlationId", "workerId", "workerName",
        "jobId", "jobType", "eventId", "eventType", "route", "method",
        "statusCode", "durationMs", "errorMessage", "errorStack", "context",
        "createdAt", "updatedAt"
      ) VALUES (
        ${randomUUID()},
        ${record.scope},
        ${record.source},
        ${record.operation},
        ${record.level},
        ${record.message},
        ${record.requestId ?? null},
        ${record.correlationId ?? null},
        ${record.workerId ?? null},
        ${record.workerName ?? null},
        ${record.jobId ?? null},
        ${record.jobType ?? null},
        ${record.eventId ?? null},
        ${record.eventType ?? null},
        ${record.route ?? null},
        ${record.method ?? null},
        ${record.statusCode ?? null},
        ${record.durationMs ?? null},
        ${record.errorMessage ?? null},
        ${record.errorStack ?? null},
        CAST(${contextJson} AS JSONB),
        NOW(),
        NOW()
      )
    `;
  } catch (err) {
    console.error(
      "[observability] persistObservabilityLog failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

export async function persistExecutionMetric(
  record: ExecutionMetricRecord,
): Promise<void> {
  try {
    const contextJson = JSON.stringify(toSerializableJson(record.context));
    await prisma.$executeRaw`
      INSERT INTO "execution_metrics" (
        "id", "scope", "source", "name", "operation", "success",
        "startedAt", "finishedAt", "durationMs", "throughputCount",
        "statusCode", "requestId", "correlationId", "workerId", "workerName",
        "jobId", "jobType", "eventId", "eventType", "route", "method",
        "errorMessage", "errorCode", "context", "createdAt", "updatedAt"
      ) VALUES (
        ${randomUUID()},
        ${record.scope},
        ${record.source},
        ${record.name},
        ${record.operation},
        ${record.success},
        ${record.startedAt},
        ${record.finishedAt},
        ${record.durationMs},
        ${record.throughputCount ?? 1},
        ${record.statusCode ?? null},
        ${record.requestId ?? null},
        ${record.correlationId ?? null},
        ${record.workerId ?? null},
        ${record.workerName ?? null},
        ${record.jobId ?? null},
        ${record.jobType ?? null},
        ${record.eventId ?? null},
        ${record.eventType ?? null},
        ${record.route ?? null},
        ${record.method ?? null},
        ${record.errorMessage ?? null},
        ${record.errorCode ?? null},
        CAST(${contextJson} AS JSONB),
        NOW(),
        NOW()
      )
    `;
  } catch (err) {
    console.error(
      "[observability] persistExecutionMetric failed:",
      err instanceof Error ? err.message : err,
    );
  }
}
