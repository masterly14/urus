/**
 * Rescate de Partes de Visita huérfanos.
 *
 * Detecta `ParteVisitaSession` en estado `PENDING` cuya `visitDateTime` ya
 * pasó hace más de `graceMinutes` y intenta el envío:
 *
 *   1. Si la sesión NO tiene `qstashMessageId`, el publish original falló y
 *      ya nadie va a llamar al endpoint. Llamamos `sendParteVisitaForSession`
 *      directamente.
 *   2. Si la sesión SÍ tiene `qstashMessageId` pero la visita ya pasó hace
 *      `graceMinutes` y seguimos en PENDING, asumimos que QStash entregó pero
 *      el endpoint falló todos los retries, o no llegó a entregar. Llamamos
 *      `sendParteVisitaForSession` igualmente: es idempotente gracias al
 *      claim atómico en send.ts, así que no hay riesgo de duplicar el Flow.
 *
 * `sendParteVisitaForSession` ya hace todas las comprobaciones y devuelve
 * outcomes tipados — aquí solo orquestamos el barrido y agregamos métricas.
 *
 * Para evitar barridos catastróficos si la BD acumula sesiones muy antiguas
 * (p. ej. tras una caída larga), limitamos el batch con `maxBatch` y solo
 * miramos hacia atrás `lookbackMinutes` (default 7 días).
 */

import { prisma } from "@/lib/prisma";
import { sendParteVisitaForSession } from "./send";

export type RescueParteVisitaResult = {
  scanned: number;
  rescued: number;
  failed: number;
  skipped: number;
  outcomes: Array<{
    sessionId: string;
    visitDateTimeIso: string;
    hadQstashMessageId: boolean;
    result: string;
    error?: string;
  }>;
};

export type RescueParteVisitaOptions = {
  /** Minutos de gracia: solo se rescatan visitas con visitDateTime <= now - grace. Default: 5. */
  graceMinutes?: number;
  /** Ventana hacia atrás máxima en minutos. Default: 7*24*60 = 10080 (7 días). */
  lookbackMinutes?: number;
  /** Tope de sesiones a procesar en una invocación. Default: 50. */
  maxBatch?: number;
  /** Inyectar `now` para tests. */
  now?: Date;
};

export async function rescueOrphanParteVisitas(
  opts: RescueParteVisitaOptions = {},
): Promise<RescueParteVisitaResult> {
  const grace = opts.graceMinutes ?? 5;
  const lookback = opts.lookbackMinutes ?? 7 * 24 * 60;
  const max = opts.maxBatch ?? 50;
  const now = opts.now ?? new Date();

  const upperBound = new Date(now.getTime() - grace * 60_000);
  const lowerBound = new Date(now.getTime() - lookback * 60_000);

  const candidates = await prisma.parteVisitaSession.findMany({
    where: {
      state: "PENDING",
      visitDateTime: { lte: upperBound, gte: lowerBound },
    },
    orderBy: { visitDateTime: "asc" },
    take: max,
    select: {
      id: true,
      visitDateTime: true,
      qstashMessageId: true,
    },
  });

  const result: RescueParteVisitaResult = {
    scanned: candidates.length,
    rescued: 0,
    failed: 0,
    skipped: 0,
    outcomes: [],
  };

  for (const s of candidates) {
    const sendResult = await sendParteVisitaForSession(s.id);
    if (sendResult.ok) {
      if (sendResult.status === "sent") {
        result.rescued++;
      } else {
        // already_sent / not_pending: alguien (QStash retry, script manual)
        // ganó la carrera mientras barríamos. No es un fallo.
        result.skipped++;
      }
      result.outcomes.push({
        sessionId: s.id,
        visitDateTimeIso: s.visitDateTime.toISOString(),
        hadQstashMessageId: !!s.qstashMessageId,
        result: sendResult.status,
      });
    } else {
      result.failed++;
      result.outcomes.push({
        sessionId: s.id,
        visitDateTimeIso: s.visitDateTime.toISOString(),
        hadQstashMessageId: !!s.qstashMessageId,
        result: sendResult.permanent ? "permanent_error" : "transient_error",
        error: sendResult.error,
      });
    }
  }

  return result;
}
