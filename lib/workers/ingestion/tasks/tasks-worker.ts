/**
 * Tasks Ingestion Worker — polls Inmovilla for new captación tasks,
 * creates NotaEncargoSession and enqueues reminder jobs.
 */

import { loginToInmovilla } from "@/lib/inmovilla/auth/login";
import { prisma } from "@/lib/prisma";
import { appendEventAndEnqueueJob } from "@/lib/event-store";
import { runWithWorkerObservability } from "@/lib/observability";
import { fetchTaskList, fetchTaskDetail } from "./tasks-fetcher";
import {
  isCaptacionTask,
  isValidCaptacionDetail,
  parseNotaEncargoDescrip,
  extractPropertyDataFromRaw,
  type RawTask,
} from "./tasks-parser";

const MAX_NEW_TASKS_PER_CYCLE = 10;
const DETAIL_FETCH_DELAY_MS = 2_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface TasksIngestionResult {
  totalListed: number;
  captacionFiltered: number;
  newTasks: number;
  sessionsCreated: number;
  skipped: number;
  error?: string;
}

async function loadExistingTaskIds(): Promise<Set<string>> {
  const snapshots = await prisma.taskSnapshot.findMany({
    select: { inmovillaTaskId: true },
  });
  return new Set(snapshots.map((s) => s.inmovillaTaskId));
}

function diffTasks(
  listed: RawTask[],
  existingIds: Set<string>,
): RawTask[] {
  return listed.filter((t) => !existingIds.has(t.codigo));
}

function parseVisitDateTime(fecha: string, hora: string): Date {
  const [year, month, day] = fecha.split("-").map(Number);
  const [h, m] = hora.split(":").map(Number);
  return new Date(year, month - 1, day, h, m, 0);
}

async function runTasksIngestion(): Promise<TasksIngestionResult> {
  const result: TasksIngestionResult = {
    totalListed: 0,
    captacionFiltered: 0,
    newTasks: 0,
    sessionsCreated: 0,
    skipped: 0,
  };

  console.log("[tasks-worker] Starting ingestion cycle...");

  const session = await loginToInmovilla({
    headless: true,
    persistSession: true,
  });

  const allTasks = await fetchTaskList(session);
  result.totalListed = allTasks.length;
  console.log(`[tasks-worker] Listed ${allTasks.length} tasks total`);

  const captacionTasks = allTasks.filter(isCaptacionTask);
  result.captacionFiltered = captacionTasks.length;
  console.log(
    `[tasks-worker] ${captacionTasks.length} captación tasks after filter`,
  );

  const existingIds = await loadExistingTaskIds();
  const newTasks = diffTasks(captacionTasks, existingIds);
  result.newTasks = newTasks.length;
  console.log(`[tasks-worker] ${newTasks.length} new tasks to process`);

  const batch = newTasks.slice(0, MAX_NEW_TASKS_PER_CYCLE);

  for (const task of batch) {
    try {
      if (DETAIL_FETCH_DELAY_MS > 0 && batch.indexOf(task) > 0) {
        await delay(DETAIL_FETCH_DELAY_MS);
      }

      const detail = await fetchTaskDetail(session, task.codigo);

      if (!isValidCaptacionDetail(detail)) {
        console.log(
          `[tasks-worker] Task ${task.codigo} not a valid captación — skipping`,
        );
        result.skipped++;
        continue;
      }

      const parsed = parseNotaEncargoDescrip(detail.descrip);
      if (!parsed) {
        console.log(
          `[tasks-worker] Task ${task.codigo} descrip parse failed — skipping`,
        );
        result.skipped++;
        continue;
      }

      const propertyCurrent = await prisma.propertyCurrent.findFirst({
        where: { ref: parsed.ref },
      });

      if (!propertyCurrent) {
        console.warn(
          `[tasks-worker] Property not found for ref ${parsed.ref} — skipping task ${task.codigo}`,
        );
        result.skipped++;
        continue;
      }

      const propertySnapshot = await prisma.propertySnapshot.findUnique({
        where: { codigo: propertyCurrent.codigo },
      });

      const raw = (propertySnapshot?.raw ?? {}) as Record<string, unknown>;
      const propertyData = extractPropertyDataFromRaw(raw, {
        ciudad: propertyCurrent.ciudad,
        zona: propertyCurrent.zona,
      });

      const visitDateTime = parseVisitDateTime(task.fecha, task.hora);

      const taskSnapshot = await prisma.taskSnapshot.create({
        data: {
          inmovillaTaskId: task.codigo,
          tipo: task.nombreSeguimiento,
          asunto: detail.asunto,
          observaciones: detail.descrip,
          agenteId: String(detail.keyagente),
          fechaAgendar: visitDateTime,
          fechaCreacion: new Date(detail.fechaalta),
          raw: detail as unknown as import("@/app/generated/prisma/client").Prisma.InputJsonValue,
        },
      });

      const notaSession = await prisma.notaEncargoSession.create({
        data: {
          taskSnapshotId: taskSnapshot.id,
          propertyCode: propertyCurrent.codigo,
          propertyRef: parsed.ref,
          comercialId: propertyCurrent.comercialId ?? String(detail.keyagente),
          propietarioPhone: parsed.phone,
          visitDateTime,
          direccion: propertyData.direccion,
          tipoOperacion: propertyData.tipoOperacion,
          precio: propertyData.precio,
        },
      });

      const twoHoursBefore = new Date(
        visitDateTime.getTime() - 2 * 60 * 60 * 1000,
      );
      const availableAt = new Date(
        Math.max(twoHoursBefore.getTime(), Date.now() + 60_000),
      );

      await appendEventAndEnqueueJob({
        event: {
          type: "NOTA_ENCARGO_DETECTADA",
          aggregateType: "PROPERTY",
          aggregateId: propertyCurrent.codigo,
          payload: {
            sessionId: notaSession.id,
            taskId: task.codigo,
            propertyRef: parsed.ref,
            propietarioPhone: parsed.phone,
            visitDateTime: visitDateTime.toISOString(),
          },
        },
        jobType: "NOTA_ENCARGO_RECORDATORIO",
        jobPayloadExtra: { sessionId: notaSession.id },
        idempotencyKeyPrefix: `nota_encargo_recordatorio:${notaSession.id}`,
        jobAvailableAt: availableAt,
      });

      result.sessionsCreated++;
      console.log(
        `[tasks-worker] Created session ${notaSession.id} for task ${task.codigo} (ref: ${parsed.ref})`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[tasks-worker] Error processing task ${task.codigo}: ${msg}`,
      );
      result.skipped++;
    }
  }

  console.log(
    `[tasks-worker] Cycle complete: ${result.sessionsCreated} sessions created, ${result.skipped} skipped`,
  );

  return result;
}

export async function runTasksIngestionCycle(): Promise<TasksIngestionResult> {
  return runWithWorkerObservability(
    { source: "worker", operation: "ingestion:tasks" },
    runTasksIngestion,
  ) as Promise<TasksIngestionResult>;
}
