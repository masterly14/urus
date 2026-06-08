/**
 * Rescate de Notas de Encargo huérfanas.
 *
 * Barre sesiones en PENDING o PENDIENTE_PROPIEDAD cuya visitDateTime ya pasó
 * y llama `sendNotaEncargoFormularioForSession` (idempotente vía claim optimista).
 */

import { prisma } from "@/lib/prisma";
import { sendNotaEncargoFormularioForSession } from "./send";

export type RescueNotaEncargoResult = {
  scanned: number;
  rescued: number;
  failed: number;
  skipped: number;
  outcomes: Array<{
    sessionId: string;
    visitDateTimeIso: string;
    priorState: string;
    result: string;
    error?: string;
  }>;
};

export type RescueNotaEncargoOptions = {
  graceMinutes?: number;
  lookbackMinutes?: number;
  maxBatch?: number;
  now?: Date;
};

export async function rescueOrphanNotaEncargos(
  opts: RescueNotaEncargoOptions = {},
): Promise<RescueNotaEncargoResult> {
  const grace = opts.graceMinutes ?? 5;
  const lookback = opts.lookbackMinutes ?? 7 * 24 * 60;
  const max = opts.maxBatch ?? 50;
  const now = opts.now ?? new Date();

  const upperBound = new Date(now.getTime() - grace * 60_000);
  const lowerBound = new Date(now.getTime() - lookback * 60_000);

  const candidates = await prisma.notaEncargoSession.findMany({
    where: {
      state: { in: ["PENDING", "PENDIENTE_PROPIEDAD"] },
      visitDateTime: { lte: upperBound, gte: lowerBound },
    },
    orderBy: { visitDateTime: "asc" },
    take: max,
    select: {
      id: true,
      visitDateTime: true,
      state: true,
    },
  });

  const result: RescueNotaEncargoResult = {
    scanned: candidates.length,
    rescued: 0,
    failed: 0,
    skipped: 0,
    outcomes: [],
  };

  for (const s of candidates) {
    const sendResult = await sendNotaEncargoFormularioForSession(s.id);
    if (sendResult.ok) {
      if (sendResult.status === "sent") {
        result.rescued++;
      } else {
        result.skipped++;
      }
      result.outcomes.push({
        sessionId: s.id,
        visitDateTimeIso: s.visitDateTime.toISOString(),
        priorState: s.state,
        result: sendResult.status,
      });
    } else {
      result.failed++;
      result.outcomes.push({
        sessionId: s.id,
        visitDateTimeIso: s.visitDateTime.toISOString(),
        priorState: s.state,
        result: sendResult.permanent ? "permanent_error" : "transient_error",
        error: sendResult.error,
      });
    }
  }

  return result;
}
