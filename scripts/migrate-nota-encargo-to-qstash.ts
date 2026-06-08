/**
 * Migrar jobs legacy de Nota de Encargo en `job_queue` a QStash.
 *
 * Solo migra ENVIAR_FORMULARIO y MATCHING_CHECK. Los jobs de recordatorio y
 * check-confirmacion se eliminan sin republicar (flujo deprecado).
 */

import "dotenv/config";
import type { JobQueue } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  publishNotaEncargoFormularioSchedule,
  publishNotaEncargoMatchingCheckSchedule,
} from "../lib/nota-encargo/schedule";

const CONFIRM = process.argv.includes("--confirm");
const NOTA_ENCARGO_MATCHING_DEADLINE_DAYS = Number(
  process.env.NOTA_ENCARGO_MATCHING_DEADLINE_DAYS || "7",
);

const DEPRECATED_JOB_TYPES = [
  "NOTA_ENCARGO_RECORDATORIO",
  "NOTA_ENCARGO_CHECK_CONFIRMACION",
] as const;

type MigratableJobType =
  | "NOTA_ENCARGO_ENVIAR_FORMULARIO"
  | "NOTA_ENCARGO_MATCHING_CHECK";

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
) {
  switch (jobType) {
    case "NOTA_ENCARGO_ENVIAR_FORMULARIO":
      return publishNotaEncargoFormularioSchedule({ sessionId, sendAt });
    case "NOTA_ENCARGO_MATCHING_CHECK":
      return publishNotaEncargoMatchingCheckSchedule({ sessionId, sendAt });
  }
}

async function main() {
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

  console.log(`\n=== Migrar Nota de Encargo pendientes → QStash ===`);
  console.log(`Mode         : ${CONFIRM ? "APPLY" : "DRY-RUN"}`);
  console.log(`Jobs PENDING : ${jobs.length}\n`);

  let migrated = 0;
  let deprecatedDeleted = 0;
  let skippedPast = 0;
  let skippedNoSession = 0;
  let errors = 0;

  for (const job of jobs) {
    const payload = (job.payload ?? {}) as { sessionId?: string };
    const sessionId = payload.sessionId ?? "";
    if (!sessionId) {
      skippedNoSession++;
      continue;
    }

    if (
      DEPRECATED_JOB_TYPES.includes(
        job.type as (typeof DEPRECATED_JOB_TYPES)[number],
      )
    ) {
      if (!CONFIRM) {
        console.log(`  - job=${job.id} type=${job.type} → would delete (deprecated)`);
        continue;
      }
      await prisma.jobQueue.delete({ where: { id: job.id } });
      deprecatedDeleted++;
      console.log(`  ✓ job=${job.id} type=${job.type} deleted (deprecated)`);
      continue;
    }

    const session = await prisma.notaEncargoSession.findUnique({
      where: { id: sessionId },
      select: { id: true, visitDateTime: true, state: true },
    });
    if (!session) {
      skippedNoSession++;
      continue;
    }

    const target = targetForJob(job, session);
    if (target.getTime() <= now.getTime()) {
      skippedPast++;
      continue;
    }

    if (!CONFIRM) {
      console.log(
        `  - job=${job.id} type=${job.type} target=${target.toISOString()} → would schedule + delete`,
      );
      continue;
    }

    try {
      const { messageId, sendAtIso } = await publishForJob(
        job.type as MigratableJobType,
        sessionId,
        target,
      );
      await prisma.jobQueue.delete({ where: { id: job.id } });
      console.log(
        `  ✓ job=${job.id} type=${job.type} qstashMsg=${messageId} sendAt=${sendAtIso}`,
      );
      migrated++;
    } catch (err) {
      errors++;
      console.error(
        `  ✗ job=${job.id}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  console.log(`\n=== Resumen ===`);
  console.log(`  Migrados           : ${migrated}`);
  console.log(`  Deprecated deleted : ${deprecatedDeleted}`);
  console.log(`  Pasados (skip)     : ${skippedPast}`);
  console.log(`  Sin sesión (skip)  : ${skippedNoSession}`);
  console.log(`  Errores            : ${errors}\n`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[migrate-nota-encargo-to-qstash] ERROR:", err);
  try {
    await prisma.$disconnect();
  } catch {}
  process.exit(1);
});
