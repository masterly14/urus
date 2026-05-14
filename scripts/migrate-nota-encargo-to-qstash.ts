/**
 * Migrar los jobs pendientes de Nota de Encargo en `job_queue` a QStash.
 *
 * Antes del cambio de arquitectura los pasos del flujo se encolaban como jobs
 * en `job_queue`. Tras la migración a QStash, los jobs ya encolados pueden
 * sufrir el mismo backlog que motivó el cambio.
 *
 * Este script:
 *   1. Recorre `job_queue` por tipos NOTA_ENCARGO_* en estado PENDING.
 *   2. Calcula el `notBefore` esperado por tipo a partir de `visitDateTime`.
 *   3. Publica un mensaje QStash al endpoint dedicado correspondiente.
 *   4. Borra el job en `job_queue` para evitar doble ejecución.
 *
 * Jobs cuya fecha objetivo ya pasó se omiten — para rescates puntuales usar
 * `scripts/force-send-nota-encargo.ts`.
 *
 * Uso:
 *   npx tsx scripts/migrate-nota-encargo-to-qstash.ts             (dry-run)
 *   npx tsx scripts/migrate-nota-encargo-to-qstash.ts --confirm
 */

import "dotenv/config";
import type { JobQueue } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  publishNotaEncargoCheckConfirmacionSchedule,
  publishNotaEncargoFormularioSchedule,
  publishNotaEncargoMatchingCheckSchedule,
  publishNotaEncargoRecordatorioSchedule,
} from "../lib/nota-encargo/schedule";

const CONFIRM = process.argv.includes("--confirm");
const NOTA_ENCARGO_MATCHING_DEADLINE_DAYS = Number(
  process.env.NOTA_ENCARGO_MATCHING_DEADLINE_DAYS || "7",
);

type JobType =
  | "NOTA_ENCARGO_RECORDATORIO"
  | "NOTA_ENCARGO_CHECK_CONFIRMACION"
  | "NOTA_ENCARGO_ENVIAR_FORMULARIO"
  | "NOTA_ENCARGO_MATCHING_CHECK";

function targetForJob(
  job: Pick<JobQueue, "type" | "availableAt">,
  session: { visitDateTime: Date },
): Date {
  switch (job.type) {
    case "NOTA_ENCARGO_RECORDATORIO":
      return new Date(session.visitDateTime.getTime() - 2 * 60 * 60 * 1000);
    case "NOTA_ENCARGO_CHECK_CONFIRMACION":
      return new Date(session.visitDateTime.getTime() - 30 * 60 * 1000);
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
  jobType: JobType,
  sessionId: string,
  sendAt: Date,
) {
  switch (jobType) {
    case "NOTA_ENCARGO_RECORDATORIO":
      return publishNotaEncargoRecordatorioSchedule({ sessionId, sendAt });
    case "NOTA_ENCARGO_CHECK_CONFIRMACION":
      return publishNotaEncargoCheckConfirmacionSchedule({ sessionId, sendAt });
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
          "NOTA_ENCARGO_RECORDATORIO",
          "NOTA_ENCARGO_CHECK_CONFIRMACION",
          "NOTA_ENCARGO_ENVIAR_FORMULARIO",
          "NOTA_ENCARGO_MATCHING_CHECK",
        ],
      },
    },
    orderBy: { availableAt: "asc" },
  });

  console.log(`\n=== Migrar Nota de Encargo pendientes → QStash ===`);
  console.log(`Now              : ${now.toISOString()}`);
  console.log(`Matching deadline: ${NOTA_ENCARGO_MATCHING_DEADLINE_DAYS} días`);
  console.log(`Mode             : ${CONFIRM ? "APPLY" : "DRY-RUN"}`);
  console.log(`Jobs PENDING     : ${jobs.length}\n`);

  let migrated = 0;
  let skippedPast = 0;
  let skippedNoSession = 0;
  let errors = 0;

  for (const job of jobs) {
    const payload = (job.payload ?? {}) as { sessionId?: string };
    const sessionId = payload.sessionId ?? "";
    if (!sessionId) {
      console.log(`  - job=${job.id} type=${job.type} → SKIP (sin sessionId)`);
      skippedNoSession++;
      continue;
    }

    const session = await prisma.notaEncargoSession.findUnique({
      where: { id: sessionId },
      select: { id: true, visitDateTime: true, state: true },
    });
    if (!session) {
      console.log(`  - job=${job.id} type=${job.type} session=${sessionId} → SKIP (sesión no existe)`);
      skippedNoSession++;
      continue;
    }

    const target = targetForJob(job, session);
    if (target.getTime() <= now.getTime()) {
      console.log(
        `  - job=${job.id} type=${job.type} target=${target.toISOString()} state=${session.state} → SKIP (pasado, usar force-send)`,
      );
      skippedPast++;
      continue;
    }

    if (!CONFIRM) {
      console.log(
        `  - job=${job.id} type=${job.type} session=${sessionId} target=${target.toISOString()} → would schedule + delete`,
      );
      continue;
    }

    try {
      const { messageId, sendAtIso } = await publishForJob(
        job.type as JobType,
        sessionId,
        target,
      );
      await prisma.jobQueue.delete({ where: { id: job.id } });
      console.log(
        `  ✓ job=${job.id} type=${job.type} qstashMsg=${messageId} sendAt=${sendAtIso}`,
      );
      migrated++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ job=${job.id} type=${job.type} ERROR: ${message}`);
      errors++;
    }
  }

  console.log(`\n=== Resumen ===`);
  console.log(`  Migrados        : ${migrated}`);
  console.log(`  Pasados (skip)  : ${skippedPast}`);
  console.log(`  Sin sesión (skip): ${skippedNoSession}`);
  console.log(`  Errores         : ${errors}\n`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(
    "[migrate-nota-encargo-to-qstash] ERROR:",
    err instanceof Error ? err.message : err,
  );
  try {
    await prisma.$disconnect();
  } catch {}
  process.exit(1);
});
