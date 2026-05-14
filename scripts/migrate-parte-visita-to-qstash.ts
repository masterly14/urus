/**
 * Migrar Parte de Visita pendientes a QStash schedules.
 *
 * Antes del cambio de arquitectura, las visitas confirmadas encolaban un job
 * `PARTE_VISITA_ENVIAR_FORMULARIO` en `job_queue`. Tras la migración a QStash,
 * los jobs ya encolados quedan en cola compartida y pueden sufrir backlog.
 *
 * Este script:
 *   1. Busca cada `ParteVisitaSession` en estado `PENDING`.
 *   2. Publica un mensaje en QStash con `notBefore = visitDateTime` apuntando
 *      al endpoint `/api/parte-visita/send`.
 *   3. Borra el job `PARTE_VISITA_ENVIAR_FORMULARIO` (PENDING) asociado en
 *      `job_queue` para evitar doble envío vía consumer.
 *
 * Visitas con `visitDateTime` ya pasado se omiten (usar
 * `scripts/force-send-parte-visita.ts` para esas).
 *
 * Uso:
 *   npx tsx scripts/migrate-parte-visita-to-qstash.ts             (dry-run)
 *   npx tsx scripts/migrate-parte-visita-to-qstash.ts --confirm
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { publishParteVisitaSendSchedule } from "../lib/parte-visita/schedule";

const CONFIRM = process.argv.includes("--confirm");

async function main() {
  const now = new Date();
  const sessions = await prisma.parteVisitaSession.findMany({
    where: { state: "PENDING" },
    orderBy: { visitDateTime: "asc" },
    select: {
      id: true,
      visitSessionId: true,
      buyerPhone: true,
      visitDateTime: true,
    },
  });

  console.log(`\n=== Migrar Parte de Visita pendientes → QStash ===`);
  console.log(`Now    : ${now.toISOString()}`);
  console.log(`Mode   : ${CONFIRM ? "APPLY" : "DRY-RUN"}`);
  console.log(`Sesiones PENDING: ${sessions.length}\n`);

  let migrated = 0;
  let skippedPast = 0;
  let skippedNoJob = 0;

  for (const s of sessions) {
    const isPast = s.visitDateTime.getTime() <= now.getTime();
    if (isPast) {
      console.log(
        `  - ${s.id}  visit=${s.visitDateTime.toISOString()}  buyer=${s.buyerPhone}  → SKIP (pasada — usar force-send-parte-visita.ts)`,
      );
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
      select: { id: true, idempotencyKey: true },
    });

    if (!CONFIRM) {
      console.log(
        `  - ${s.id}  visit=${s.visitDateTime.toISOString()}  buyer=${s.buyerPhone}  → would schedule QStash + delete job ${job?.id ?? "(none)"}`,
      );
      continue;
    }

    const { messageId, sendAtIso } = await publishParteVisitaSendSchedule({
      parteVisitaSessionId: s.id,
      visitDateTime: s.visitDateTime,
    });

    if (job) {
      await prisma.jobQueue.delete({ where: { id: job.id } });
    } else {
      skippedNoJob++;
    }

    console.log(
      `  ✓ ${s.id}  qstashMsg=${messageId}  sendAt=${sendAtIso}  jobDeleted=${job?.id ?? "(none)"}`,
    );
    migrated++;
  }

  console.log(`\n=== Resumen ===`);
  console.log(`  Migradas      : ${migrated}`);
  console.log(`  Pasadas (skip): ${skippedPast}`);
  console.log(`  Sin job legacy: ${skippedNoJob}\n`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[migrate-parte-visita-to-qstash] ERROR:", err instanceof Error ? err.message : err);
  try {
    await prisma.$disconnect();
  } catch {}
  process.exit(1);
});
