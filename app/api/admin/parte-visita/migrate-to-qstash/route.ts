/**
 * Endpoint admin one-shot: migrar las `ParteVisitaSession` pendientes a
 * QStash schedules.
 *
 * Mismo objetivo que `scripts/migrate-parte-visita-to-qstash.ts`, pero
 * ejecutable desde el entorno de Vercel (donde QSTASH_TOKEN es el de
 * producción). Útil tras el cambio de arquitectura para drenar el remanente
 * de jobs `PARTE_VISITA_ENVIAR_FORMULARIO` que quedaron en `job_queue`.
 *
 * Autenticación:
 *   - Firma Upstash, o
 *   - Header `Authorization: Bearer <CRON_SECRET>` (uso manual via curl).
 *
 * Las sesiones con `visitDateTime` ya pasado se omiten: usar
 * `scripts/force-send-parte-visita.ts` para esos rescates.
 */

import { NextResponse } from "next/server";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { withObservedRoute } from "@/lib/observability";
import { prisma } from "@/lib/prisma";
import { publishParteVisitaSendSchedule } from "@/lib/parte-visita/schedule";

type Outcome = {
  parteVisitaSessionId: string;
  visitSessionId: string;
  visitDateTime: string;
  result:
    | { status: "scheduled"; qstashMessageId: string; sendAtIso: string; legacyJobDeleted: string | null }
    | { status: "skipped_past" }
    | { status: "error"; error: string };
};

const postHandler = async (request: Request) => {
  if (!(await isQstashAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const sessions = await prisma.parteVisitaSession.findMany({
    where: { state: "PENDING" },
    orderBy: { visitDateTime: "asc" },
    select: {
      id: true,
      visitSessionId: true,
      visitDateTime: true,
    },
  });

  const outcomes: Outcome[] = [];
  let migrated = 0;
  let skippedPast = 0;
  let errors = 0;

  for (const s of sessions) {
    if (s.visitDateTime.getTime() <= now.getTime()) {
      outcomes.push({
        parteVisitaSessionId: s.id,
        visitSessionId: s.visitSessionId,
        visitDateTime: s.visitDateTime.toISOString(),
        result: { status: "skipped_past" },
      });
      skippedPast++;
      continue;
    }

    const job = await prisma.jobQueue.findFirst({
      where: {
        type: "PARTE_VISITA_ENVIAR_FORMULARIO",
        status: "PENDING",
        OR: [
          { payload: { path: ["sessionId"], equals: s.id } },
          { idempotencyKey: { startsWith: `parte_visita_formulario:${s.id}` } },
        ],
      },
      select: { id: true },
    });

    try {
      const { messageId, sendAtIso } = await publishParteVisitaSendSchedule({
        parteVisitaSessionId: s.id,
        visitDateTime: s.visitDateTime,
      });

      if (job) {
        await prisma.jobQueue.delete({ where: { id: job.id } });
      }

      outcomes.push({
        parteVisitaSessionId: s.id,
        visitSessionId: s.visitSessionId,
        visitDateTime: s.visitDateTime.toISOString(),
        result: {
          status: "scheduled",
          qstashMessageId: messageId,
          sendAtIso,
          legacyJobDeleted: job?.id ?? null,
        },
      });
      migrated++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      outcomes.push({
        parteVisitaSessionId: s.id,
        visitSessionId: s.visitSessionId,
        visitDateTime: s.visitDateTime.toISOString(),
        result: { status: "error", error: message },
      });
      errors++;
    }
  }

  return NextResponse.json({
    ok: true,
    now: now.toISOString(),
    totalPending: sessions.length,
    migrated,
    skippedPast,
    errors,
    outcomes,
  });
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/admin/parte-visita/migrate-to-qstash" },
  postHandler,
);

export const maxDuration = 60;
