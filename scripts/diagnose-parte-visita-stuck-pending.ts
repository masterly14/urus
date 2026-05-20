/**
 * diagnose-parte-visita-stuck-pending.ts
 *
 * Lista todas las `ParteVisitaSession` cuya `visitDateTime` ya pasó y que
 * siguen en estado `PENDING`. Cruza cada una con QStash para ver si el publish
 * se llegó a registrar y con `WHATSAPP_ENVIADO` para ver si hubo algún envío
 * manual posterior.
 *
 * Hipótesis a verificar:
 *   Cuando `publishParteVisitaSendSchedule` falla AFTER de crear la sesión,
 *   la sesión queda huérfana (existe en BD pero sin programación en QStash).
 *   Un reintento manual desde la UI detecta `existing` en
 *   `scheduleParteVisitaFromDetails` y NO vuelve a publicar.
 *
 * Uso:
 *   npx tsx scripts/diagnose-parte-visita-stuck-pending.ts
 *   npx tsx scripts/diagnose-parte-visita-stuck-pending.ts --since-days 30
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";

const SEP = "─".repeat(80);

function h(t: string) {
  console.log(`\n${SEP}\n  ${t}\n${SEP}`);
}

function ts(d: Date | null | undefined): string {
  if (!d) return "(null)";
  return d.toISOString().replace("T", " ").slice(0, 19) + "Z";
}

function parseArgs(argv: string[]): { sinceDays: number } {
  let sinceDays = 30;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--since-days") sinceDays = Number(argv[++i]);
  }
  return { sinceDays };
}

async function main() {
  const { sinceDays } = parseArgs(process.argv);
  const since = new Date(Date.now() - sinceDays * 24 * 3600_000);
  const now = new Date();

  h(`ParteVisitaSession state=PENDING con visitDateTime < ahora (últimos ${sinceDays}d)`);

  const stuck = await prisma.parteVisitaSession.findMany({
    where: {
      state: "PENDING",
      visitDateTime: { lt: now, gte: since },
    },
    orderBy: { visitDateTime: "desc" },
  });

  console.log(`\nTotal sesiones huérfanas: ${stuck.length}\n`);

  if (stuck.length === 0) {
    await prisma.$disconnect();
    return;
  }

  for (const s of stuck) {
    const visit = await prisma.visitSchedulingSession.findUnique({
      where: { id: s.visitSessionId },
      select: { id: true, state: true, calendarEventId: true, completedAt: true },
    });

    // ¿Hay envíos posteriores (manuales) al comercial?
    const sends = await prisma.event.findMany({
      where: {
        type: "WHATSAPP_ENVIADO",
        aggregateType: "WHATSAPP_CONVERSATION",
        occurredAt: { gte: s.visitDateTime, lte: new Date(Date.now() + 60_000) },
        payload: { path: ["kind"], string_starts_with: "parte_visita_" },
      },
      orderBy: { occurredAt: "asc" },
      take: 20,
    });
    const sendsForSession = sends.filter((e) => {
      const payload = e.payload as Record<string, unknown> | null;
      const inner = payload?.["parteVisitaSessionId"];
      return inner === s.id;
    });

    // ¿Sigue existiendo un legacy JobQueue?
    const job = await prisma.jobQueue.findFirst({
      where: {
        type: "PARTE_VISITA_ENVIAR_FORMULARIO",
        OR: [
          { payload: { path: ["sessionId"], equals: s.id } },
          { idempotencyKey: { startsWith: `parte_visita_formulario:${s.id}` } },
        ],
      },
      select: { id: true, status: true, attempts: true, availableAt: true, lastError: true },
    });

    console.log(SEP);
    console.log(`  ParteVisitaSession id=${s.id}`);
    console.log(`    visitDateTime  = ${ts(s.visitDateTime)}`);
    console.log(`    createdAt      = ${ts(s.createdAt)}`);
    console.log(`    updatedAt      = ${ts(s.updatedAt)}`);
    console.log(`    buyerPhone     = ${s.buyerPhone}`);
    console.log(`    comercialId    = ${s.comercialId}`);
    console.log(`    propertyRef    = ${s.propertyRef}`);
    console.log(`    visitSessionId = ${s.visitSessionId}`);
    console.log(
      `    visitSession   = ${visit ? `state=${visit.state} completedAt=${ts(visit.completedAt)} calId=${visit.calendarEventId ?? "(none)"}` : "(NOT FOUND)"}`,
    );
    console.log(
      `    legacyJob      = ${job ? `id=${job.id} status=${job.status} attempts=${job.attempts} availableAt=${ts(job.availableAt)}` : "(none)"}`,
    );
    if (sendsForSession.length === 0) {
      console.log(`    enviosPost     = (ninguno tras visitDateTime)`);
    } else {
      console.log(`    enviosPost     = ${sendsForSession.length} envíos manuales tras la visita`);
      for (const e of sendsForSession.slice(0, 5)) {
        const p = e.payload as Record<string, unknown>;
        console.log(`        · ${ts(e.occurredAt)}  kind=${p["kind"]}  to=${e.aggregateId}`);
      }
    }
  }

  // ------------------------------------------------------------------
  // Resumen
  // ------------------------------------------------------------------
  h("Resumen del patrón");
  const withJob = stuck.filter((_) => false); // placeholder, lo recalculamos
  let withJobCount = 0;
  let withSendsCount = 0;
  let noEvidenceCount = 0;
  for (const s of stuck) {
    const job = await prisma.jobQueue.findFirst({
      where: {
        type: "PARTE_VISITA_ENVIAR_FORMULARIO",
        OR: [
          { payload: { path: ["sessionId"], equals: s.id } },
          { idempotencyKey: { startsWith: `parte_visita_formulario:${s.id}` } },
        ],
      },
      select: { id: true },
    });
    const sends = await prisma.event.findMany({
      where: {
        type: "WHATSAPP_ENVIADO",
        aggregateType: "WHATSAPP_CONVERSATION",
        occurredAt: { gte: s.visitDateTime },
        payload: { path: ["parteVisitaSessionId"], equals: s.id },
      },
      select: { id: true },
    });
    if (job) withJobCount++;
    if (sends.length > 0) withSendsCount++;
    if (!job && sends.length === 0) noEvidenceCount++;
  }
  console.log(`  Total stuck PENDING : ${stuck.length}`);
  console.log(`  Con legacy job aún  : ${withJobCount}  (job_queue no migrado)`);
  console.log(`  Con envíos manuales : ${withSendsCount}  (alguien lo reenvió a mano)`);
  console.log(`  Sin evidencia       : ${noEvidenceCount}  (nunca se llegó a enviar)`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[diagnose-parte-visita-stuck-pending] ERROR:", err);
  try { await prisma.$disconnect(); } catch {}
  process.exit(99);
});
