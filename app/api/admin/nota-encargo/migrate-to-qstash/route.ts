/**
 * Endpoint admin one-shot: migrar jobs pendientes de Nota de Encargo en
 * `job_queue` a schedules de QStash.
 *
 * Solo migra ENVIAR_FORMULARIO y MATCHING_CHECK. Los jobs de recordatorio y
 * check-confirmacion (flujo deprecado) se eliminan sin republicar.
 *
 * Autenticación:
 *   - Firma Upstash, o
 *   - Header `Authorization: Bearer <CRON_SECRET>` (uso manual via curl).
 */

import { NextResponse } from "next/server";
import type { JobQueue } from "@prisma/client";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { withObservedRoute } from "@/lib/observability";
import { prisma } from "@/lib/prisma";
import {
  publishNotaEncargoFormularioSchedule,
  publishNotaEncargoMatchingCheckSchedule,
} from "@/lib/nota-encargo/schedule";

const NOTA_ENCARGO_MATCHING_DEADLINE_DAYS = Number(
  process.env.NOTA_ENCARGO_MATCHING_DEADLINE_DAYS || "7",
);

const DEPRECATED_JOB_TYPES = [
  "NOTA_ENCARGO_RECORDATORIO",
  "NOTA_ENCARGO_CHECK_CONFIRMACION",
] as const;

type JobType =
  | (typeof DEPRECATED_JOB_TYPES)[number]
  | "NOTA_ENCARGO_ENVIAR_FORMULARIO"
  | "NOTA_ENCARGO_MATCHING_CHECK";

type MigratableJobType =
  | "NOTA_ENCARGO_ENVIAR_FORMULARIO"
  | "NOTA_ENCARGO_MATCHING_CHECK";

type Outcome = {
  jobId: string;
  jobType: JobType;
  sessionId: string;
  targetIso: string;
  result:
    | { status: "scheduled"; qstashMessageId: string; sendAtIso: string }
    | { status: "deprecated_deleted" }
    | { status: "skipped_past" }
    | { status: "skipped_no_session" }
    | { status: "error"; error: string };
};

function targetForJob(
  job: Pick<JobQueue, "type" | "availableAt">,
  session: { visitDateTime: Date },
): Date {
  switch (job.type) {
    case "NOTA_ENCARGO_ENVIAR_FORMULARIO":
      return session.visitDateTime;
    case "NOTA_ENCARGO_MATCHING_CHECK":
      return new Date(
        session.visitDateTime.getTime() +
          NOTA_ENCARGO_MATCHING_DEADLINE_DAYS * 24 * 60 * 60 * 1000,
      );
    default:
      return job.availableAt;
  }
}

async function publishForJob(
  jobType: MigratableJobType,
  sessionId: string,
  sendAt: Date,
): Promise<{ messageId: string; sendAtIso: string }> {
  switch (jobType) {
    case "NOTA_ENCARGO_ENVIAR_FORMULARIO":
      return publishNotaEncargoFormularioSchedule({ sessionId, sendAt });
    case "NOTA_ENCARGO_MATCHING_CHECK":
      return publishNotaEncargoMatchingCheckSchedule({ sessionId, sendAt });
  }
}

const postHandler = async (request: Request) => {
  if (!(await isQstashAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const jobs = await prisma.jobQueue.findMany({
    where: {
      status: "PENDING",
      type: {
        in: [
          ...DEPRECATED_JOB_TYPES,
          "NOTA_ENCARGO_ENVIAR_FORMULARIO",
          "NOTA_ENCARGO_MATCHING_CHECK",
        ],
      },
    },
    orderBy: { availableAt: "asc" },
  });

  const outcomes: Outcome[] = [];
  let migrated = 0;
  let deprecatedDeleted = 0;
  let skippedPast = 0;
  let skippedNoSession = 0;
  let errors = 0;

  for (const job of jobs) {
    const payload = (job.payload ?? {}) as { sessionId?: string };
    const sessionId = payload.sessionId ?? "";

    if (
      DEPRECATED_JOB_TYPES.includes(
        job.type as (typeof DEPRECATED_JOB_TYPES)[number],
      )
    ) {
      await prisma.jobQueue.delete({ where: { id: job.id } });
      outcomes.push({
        jobId: job.id,
        jobType: job.type as JobType,
        sessionId,
        targetIso: job.availableAt.toISOString(),
        result: { status: "deprecated_deleted" },
      });
      deprecatedDeleted++;
      continue;
    }

    if (!sessionId) {
      outcomes.push({
        jobId: job.id,
        jobType: job.type as JobType,
        sessionId: "",
        targetIso: job.availableAt.toISOString(),
        result: { status: "skipped_no_session" },
      });
      skippedNoSession++;
      continue;
    }

    const session = await prisma.notaEncargoSession.findUnique({
      where: { id: sessionId },
      select: { id: true, visitDateTime: true },
    });
    if (!session) {
      outcomes.push({
        jobId: job.id,
        jobType: job.type as JobType,
        sessionId,
        targetIso: job.availableAt.toISOString(),
        result: { status: "skipped_no_session" },
      });
      skippedNoSession++;
      continue;
    }

    const target = targetForJob(job, session);
    if (target.getTime() <= now.getTime()) {
      outcomes.push({
        jobId: job.id,
        jobType: job.type as JobType,
        sessionId,
        targetIso: target.toISOString(),
        result: { status: "skipped_past" },
      });
      skippedPast++;
      continue;
    }

    try {
      const { messageId, sendAtIso } = await publishForJob(
        job.type as MigratableJobType,
        sessionId,
        target,
      );
      await prisma.jobQueue.delete({ where: { id: job.id } });

      outcomes.push({
        jobId: job.id,
        jobType: job.type as JobType,
        sessionId,
        targetIso: target.toISOString(),
        result: { status: "scheduled", qstashMessageId: messageId, sendAtIso },
      });
      migrated++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      outcomes.push({
        jobId: job.id,
        jobType: job.type as JobType,
        sessionId,
        targetIso: target.toISOString(),
        result: { status: "error", error: message },
      });
      errors++;
    }
  }

  return NextResponse.json({
    ok: true,
    now: now.toISOString(),
    totalPending: jobs.length,
    migrated,
    deprecatedDeleted,
    skippedPast,
    skippedNoSession,
    errors,
    outcomes,
  });
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/admin/nota-encargo/migrate-to-qstash" },
  postHandler,
);

export const maxDuration = 60;
