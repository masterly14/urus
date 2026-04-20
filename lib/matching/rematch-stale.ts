import { prisma } from "@/lib/prisma";

/**
 * Si el run lleva demasiado tiempo en RUNNING sin procesar ninguna demanda,
 * se marca como FAILED. Típico en local cuando no está el consumer (`npm run consumer`).
 */
export const REMATCH_STALE_WITHOUT_PROGRESS_MS = 3 * 60 * 1000;

type RunStaleInput = {
  id: string;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  demandsProcessed: number;
  startedAt: Date;
};

export async function failStaleRematchRunIfNeeded(
  run: RunStaleInput,
): Promise<boolean> {
  if (run.status !== "RUNNING") return false;
  if (run.demandsProcessed > 0) return false;
  const ageMs = Date.now() - run.startedAt.getTime();
  if (ageMs <= REMATCH_STALE_WITHOUT_PROGRESS_MS) return false;

  await prisma.rematchRun.update({
    where: { id: run.id },
    data: {
      status: "FAILED",
      errorMessage:
        "Sin actividad: el consumer de jobs no está procesando la cola. En local ejecuta `npm run consumer` (o el worker equivalente en tu entorno).",
    },
  });
  return true;
}
