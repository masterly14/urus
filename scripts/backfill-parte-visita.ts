/**
 * Backfill del flujo "Parte de Visita".
 *
 * Reactiva el envío del formulario de Parte de Visita para una visita en la
 * que el job programado a `visitDateTime` no llegó a ejecutarse (o se
 * programó a una fecha errónea por el bug del formulario de "Visitas UI").
 *
 * Comportamiento equivalente a "cumplir el scheduled":
 *   1. Localiza la `VisitSchedulingSession` afectada (por teléfono o por id).
 *   2. Garantiza que existe una `ParteVisitaSession` en estado PENDING.
 *      - Si no existe, la crea reusando el propietario/dirección/precio reales.
 *      - Si existe en otro estado, la resetea a PENDING (con --confirm) o
 *        avisa de que ya se envió y aborta (sin --force).
 *   3. Encola/Reencola `PARTE_VISITA_ENVIAR_FORMULARIO` con
 *      `availableAt = ahora` para que el worker lo recoja en el siguiente
 *      ciclo. Si ya existía un job con la misma `idempotencyKey`,
 *      lo elimina antes para forzar la reejecución.
 *   4. (Opcional, `--process`) ejecuta varios ciclos del consumer in-process
 *      para procesar el job inmediatamente sin esperar al worker en background.
 *
 * Modo dry-run por defecto. Aplica los cambios con `--confirm`.
 *
 * Uso:
 *   npx tsx scripts/backfill-parte-visita.ts --phone 34644057664
 *   npx tsx scripts/backfill-parte-visita.ts --phone 34644057664 --confirm
 *   npx tsx scripts/backfill-parte-visita.ts --phone 34644057664 --confirm --process
 *   npx tsx scripts/backfill-parte-visita.ts --visit-session-id ckxxxx --confirm
 *   npx tsx scripts/backfill-parte-visita.ts --phone 34644057664 --confirm --force
 *
 * Variables de entorno necesarias (las mismas que el worker en producción):
 *   - DATABASE_URL
 *   - WHATSAPP_ACCESS_TOKEN
 *   - WHATSAPP_PHONE_NUMBER_ID
 *   - WHATSAPP_FLOW_PARTE_VISITA_ID (o WHATSAPP_TEMPLATE_PARTE_VISITA_FORMULARIO)
 */
import "dotenv/config";

import { randomUUID } from "node:crypto";
import { JobStatus, type VisitSchedulingSession } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { enqueueJob } from "@/lib/job-queue";
import { runConsumerCycle } from "@/lib/workers/consumer";
import { scheduleParteVisitaFromDetails } from "@/lib/parte-visita/schedule";
import { extractPropertyDataFromRaw } from "@/lib/nota-encargo/utils";
import { setTestSendInterceptor } from "@/lib/whatsapp/send";

interface CliOptions {
  phone: string | null;
  visitSessionId: string | null;
  visitDatetime: string | null;
  confirm: boolean;
  force: boolean;
  process: boolean;
  simulate: boolean;
  help: boolean;
}

function printUsage(): void {
  console.log(`
Uso:
  npx tsx scripts/backfill-parte-visita.ts --phone <e164>           (dry-run)
  npx tsx scripts/backfill-parte-visita.ts --phone <e164> --confirm
  npx tsx scripts/backfill-parte-visita.ts --phone <e164> --confirm --process
  npx tsx scripts/backfill-parte-visita.ts --visit-session-id <id> --confirm

Flags:
  --phone <e164>           Teléfono del comprador (puede traer prefijo o no).
  --visit-session-id <id>  ID de VisitSchedulingSession (alternativa a --phone).
  --visit-datetime <iso>   Fuerza visitDateTime al crear la ParteVisitaSession.
                           Por defecto usa confirmedSlotStart de la visita.
  --confirm                Aplica los cambios (sin esto es dry-run).
  --force                  Resetea sesiones en estado != PENDING.
  --process                Ejecuta ciclos del consumer in-process tras encolar.
  --simulate               Intercepta el envío de WhatsApp (NO manda mensaje
                           real). Útil para validar el flujo end-to-end
                           y la trazabilidad en conversaciones sin coste.
  --help                   Muestra esta ayuda.
`);
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    phone: null,
    visitSessionId: null,
    visitDatetime: null,
    confirm: false,
    force: false,
    process: false,
    simulate: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--phone":
        opts.phone = argv[++i] ?? null;
        break;
      case "--visit-session-id":
        opts.visitSessionId = argv[++i] ?? null;
        break;
      case "--visit-datetime":
        opts.visitDatetime = argv[++i] ?? null;
        break;
      case "--confirm":
        opts.confirm = true;
        break;
      case "--force":
        opts.force = true;
        break;
      case "--process":
        opts.process = true;
        break;
      case "--simulate":
        opts.simulate = true;
        break;
      case "--help":
      case "-h":
        opts.help = true;
        break;
      default:
        if (arg.startsWith("--")) {
          console.warn(`[backfill-parte-visita] flag desconocido: ${arg}`);
        }
    }
  }
  return opts;
}

function normalizePhone(raw: string): string {
  return raw.replace(/[^0-9]/g, "");
}

function fmt(date: Date | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

// ---------------------------------------------------------------------------
// Resolución de la visita
// ---------------------------------------------------------------------------

async function findVisitCandidates(opts: {
  phone: string | null;
  visitSessionId: string | null;
}): Promise<VisitSchedulingSession[]> {
  if (opts.visitSessionId) {
    const session = await prisma.visitSchedulingSession.findUnique({
      where: { id: opts.visitSessionId },
    });
    return session ? [session] : [];
  }
  if (!opts.phone) return [];

  const normalized = normalizePhone(opts.phone);
  const direct = await prisma.visitSchedulingSession.findMany({
    where: { buyerWaId: normalized },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const draftDemands = await prisma.draftDemand.findMany({
    where: { buyerPhone: normalized },
    select: { id: true },
  });
  const draftIds = draftDemands.map((d) => d.id);
  const viaDraft = draftIds.length
    ? await prisma.visitSchedulingSession.findMany({
        where: { draftDemandId: { in: draftIds } },
        orderBy: { createdAt: "desc" },
        take: 20,
      })
    : [];

  const workItems = await prisma.visitWorkItem.findMany({
    where: { buyerPhone: normalized, scheduledSessionId: { not: null } },
    select: { scheduledSessionId: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const wiSessionIds = workItems
    .map((w) => w.scheduledSessionId)
    .filter((id): id is string => Boolean(id));
  const viaWorkItem = wiSessionIds.length
    ? await prisma.visitSchedulingSession.findMany({
        where: { id: { in: wiSessionIds } },
      })
    : [];

  const merged = new Map<string, VisitSchedulingSession>();
  for (const s of [...direct, ...viaDraft, ...viaWorkItem]) {
    merged.set(s.id, s);
  }
  return Array.from(merged.values()).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
}

function chooseVisit(
  candidates: VisitSchedulingSession[],
): VisitSchedulingSession | null {
  if (candidates.length === 0) return null;
  // Preferir la más reciente con confirmedSlotStart (VISIT_CONFIRMED o VISIT_RESCHEDULED).
  const confirmed = candidates.filter(
    (c) => c.confirmedSlotStart && c.state === "VISIT_CONFIRMED",
  );
  if (confirmed.length > 0) return confirmed[0];
  // Si no hay ninguna VISIT_CONFIRMED, devolver la más reciente con confirmedSlotStart.
  const anyWithSlot = candidates.filter((c) => c.confirmedSlotStart);
  if (anyWithSlot.length > 0) return anyWithSlot[0];
  return candidates[0];
}

// ---------------------------------------------------------------------------
// Resolución de detalles de la propiedad (igual que scheduleParteVisita real)
// ---------------------------------------------------------------------------

async function resolveParteDetails(visit: VisitSchedulingSession): Promise<{
  propertyCode: string;
  propertyRef: string;
  direccion: string;
  tipoOperacion: string;
  precio: number;
}> {
  const property = await prisma.propertyCurrent.findUnique({
    where: { codigo: visit.propertyCode },
  });

  if (property) {
    const snapshot = await prisma.propertySnapshot.findFirst({
      where: { codigo: visit.propertyCode },
      orderBy: { lastSeenAt: "desc" },
      select: { raw: true },
    });

    if (snapshot?.raw && typeof snapshot.raw === "object") {
      const raw = snapshot.raw as Record<string, unknown>;
      const extracted = extractPropertyDataFromRaw(raw, {
        ciudad: property.ciudad,
        zona: property.zona,
      });
      return {
        propertyCode: visit.propertyCode,
        propertyRef: property.ref,
        direccion: extracted.direccion,
        tipoOperacion: extracted.tipoOperacion,
        precio: extracted.precio,
      };
    }

    return {
      propertyCode: visit.propertyCode,
      propertyRef: property.ref,
      direccion: [property.zona, property.ciudad].filter(Boolean).join(", "),
      tipoOperacion: "VENTA",
      precio: property.precio,
    };
  }

  // Caso provisional: la visita apunta a un DraftProperty.
  if (visit.draftPropertyId) {
    const draft = await prisma.draftProperty.findUnique({
      where: { id: visit.draftPropertyId },
    });
    return {
      propertyCode: visit.propertyCode,
      propertyRef: draft?.propertyRef ?? `DRAFT-${visit.draftPropertyId}`,
      direccion: "Direccion pendiente de completar",
      tipoOperacion: draft?.operationType ?? "VENTA",
      precio: 0,
    };
  }

  return {
    propertyCode: visit.propertyCode,
    propertyRef: visit.propertyCode,
    direccion: "Direccion pendiente de completar",
    tipoOperacion: "VENTA",
    precio: 0,
  };
}

// ---------------------------------------------------------------------------
// Backfill atómico de ParteVisitaSession + JobQueue
// ---------------------------------------------------------------------------

interface BackfillPlan {
  action:
    | "CREATE_SESSION_AND_JOB"
    | "RESET_SESSION_AND_REENQUEUE"
    | "REENQUEUE_ONLY"
    | "ALREADY_SENT_NO_ACTION";
  reason: string;
  visitDateTime: Date;
}

async function planBackfill(
  visit: VisitSchedulingSession,
  opts: CliOptions,
): Promise<BackfillPlan> {
  const existing = await prisma.parteVisitaSession.findUnique({
    where: { visitSessionId: visit.id },
  });

  const forcedDt = opts.visitDatetime ? new Date(opts.visitDatetime) : null;
  if (forcedDt && Number.isNaN(forcedDt.getTime())) {
    throw new Error(
      `--visit-datetime no es una fecha ISO válida: ${opts.visitDatetime}`,
    );
  }
  const visitDateTime =
    forcedDt ?? existing?.visitDateTime ?? visit.confirmedSlotStart ?? new Date();

  if (!existing) {
    return {
      action: "CREATE_SESSION_AND_JOB",
      reason: "No existe ParteVisitaSession para esta visita.",
      visitDateTime,
    };
  }

  if (existing.state === "PENDING") {
    return {
      action: "REENQUEUE_ONLY",
      reason: `ParteVisitaSession existe en PENDING (id=${existing.id}).`,
      visitDateTime,
    };
  }

  // Estados posteriores: el formulario YA se envió (o el flujo siguió). No
  // queremos reenviar a ciegas — solo con --force resetar a PENDING.
  const advancedStates: string[] = [
    "FORMULARIO_ENVIADO",
    "FORMULARIO_COMPLETADO",
    "FIRMA_ENVIADA",
    "FIRMADA",
    "DOCUMENTO_ENVIADO",
  ];
  if (advancedStates.includes(existing.state) && !opts.force) {
    return {
      action: "ALREADY_SENT_NO_ACTION",
      reason: `ParteVisitaSession ya está en estado ${existing.state}. Usa --force para resetear a PENDING y reenviar.`,
      visitDateTime,
    };
  }

  return {
    action: "RESET_SESSION_AND_REENQUEUE",
    reason: `ParteVisitaSession en estado ${existing.state} — se resetea a PENDING (force=${opts.force}).`,
    visitDateTime,
  };
}

async function applyBackfill(
  visit: VisitSchedulingSession,
  plan: BackfillPlan,
): Promise<{ sessionId: string; jobId: string }> {
  let sessionId: string;

  if (plan.action === "CREATE_SESSION_AND_JOB") {
    const details = await resolveParteDetails(visit);
    // scheduleParteVisitaFromDetails crea sesión + encola el job con
    // availableAt = visitDateTime. Le pasamos NOW para que se procese ya.
    await scheduleParteVisitaFromDetails({
      visitSessionId: visit.id,
      propertyCode: details.propertyCode,
      propertyRef: details.propertyRef,
      draftDemandId: visit.draftDemandId,
      comercialId: visit.comercialId,
      buyerPhone: visit.buyerWaId,
      visitDateTime: plan.visitDateTime,
      direccion: details.direccion,
      tipoOperacion: details.tipoOperacion,
      precio: details.precio,
    });
    const created = await prisma.parteVisitaSession.findUniqueOrThrow({
      where: { visitSessionId: visit.id },
    });
    sessionId = created.id;
  } else {
    const existing = await prisma.parteVisitaSession.findUniqueOrThrow({
      where: { visitSessionId: visit.id },
    });
    sessionId = existing.id;
    if (plan.action === "RESET_SESSION_AND_REENQUEUE") {
      await prisma.parteVisitaSession.update({
        where: { id: existing.id },
        data: { state: "PENDING" },
      });
    }
  }

  // Limpieza de cualquier job previo con la idempotencyKey original o de
  // backfill anteriores: COMPLETED/FAILED no permite reusar la clave única,
  // y PENDING/IN_PROGRESS bloquearía el reencolado. El handler es idempotente
  // por estado de la sesión (PENDING ⇒ envía, otros ⇒ skip), así que basta
  // con un job nuevo.
  const idempotencyKey = `parte_visita_formulario:${sessionId}`;
  await prisma.jobQueue.deleteMany({
    where: {
      OR: [
        { idempotencyKey },
        { idempotencyKey: { startsWith: `${idempotencyKey}:backfill:` } },
      ],
    },
  });

  const now = new Date();
  const job = await enqueueJob({
    type: "PARTE_VISITA_ENVIAR_FORMULARIO",
    payload: { sessionId },
    availableAt: now,
    idempotencyKey: `${idempotencyKey}:backfill:${now.toISOString()}`,
  });

  return { sessionId, jobId: job.id };
}

// ---------------------------------------------------------------------------
// Procesamiento opcional in-process
// ---------------------------------------------------------------------------

async function processInline(jobId: string): Promise<void> {
  const workerId = `backfill-parte-visita-${randomUUID().slice(0, 8)}`;
  const MAX_CYCLES = 10;
  for (let i = 0; i < MAX_CYCLES; i++) {
    const cycle = await runConsumerCycle({
      workerId,
      batchSize: 1,
      types: ["PARTE_VISITA_ENVIAR_FORMULARIO"],
    });
    if (cycle.noWork) break;
    console.log(
      `  [consumer] ciclo ${i + 1}: processed=${cycle.processed} failed=${cycle.failed}`,
    );
    const updated = await prisma.jobQueue.findUnique({ where: { id: jobId } });
    if (
      updated &&
      (updated.status === JobStatus.COMPLETED ||
        updated.status === JobStatus.FAILED ||
        updated.status === JobStatus.DEAD_LETTER)
    ) {
      console.log(`  [consumer] job ${jobId} terminó en estado ${updated.status}`);
      if (updated.lastError) {
        console.log(`  [consumer] lastError: ${updated.lastError}`);
      }
      return;
    }
  }
  console.warn(
    `  [consumer] alcanzados ${MAX_CYCLES} ciclos sin terminar el job ${jobId}`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help || (!opts.phone && !opts.visitSessionId)) {
    printUsage();
    process.exit(opts.help ? 0 : 1);
  }

  console.log("\n=== Backfill Parte de Visita ===");
  console.log(`Phone           : ${opts.phone ?? "—"}`);
  console.log(`VisitSession ID : ${opts.visitSessionId ?? "—"}`);
  console.log(`visit-datetime  : ${opts.visitDatetime ?? "(auto)"}`);
  console.log(`Modo            : ${opts.confirm ? "APPLY" : "DRY-RUN"}`);
  console.log(`Force           : ${opts.force}`);
  console.log(`In-process run  : ${opts.process}`);
  console.log(`Simulate WA     : ${opts.simulate}\n`);

  const intercepted: Array<{ to: string; type: string; payload: unknown }> = [];
  // Marca temporal para identificar eventos creados durante la simulación,
  // de modo que podamos eliminarlos al final si --simulate está activo.
  const simulationStartedAt = new Date();
  if (opts.simulate) {
    setTestSendInterceptor((msg) => {
      intercepted.push(msg);
      console.log(
        `  [intercepted WA] to=${msg.to} type=${msg.type}` +
          (msg.type === "interactive"
            ? " kind=flow"
            : msg.type === "template"
              ? ` name=${(msg.payload as { name?: string })?.name ?? "?"}`
              : ""),
      );
    });
  }

  const candidates = await findVisitCandidates({
    phone: opts.phone,
    visitSessionId: opts.visitSessionId,
  });

  if (candidates.length === 0) {
    console.error("No se encontró ninguna VisitSchedulingSession para los criterios dados.");
    process.exit(2);
  }

  console.log(`Candidatas (${candidates.length}):`);
  for (const c of candidates) {
    console.log(
      `  - ${c.id}  state=${c.state}  slot=${fmt(c.confirmedSlotStart)} → ${fmt(c.confirmedSlotEnd)}  property=${c.propertyCode}  comercial=${c.comercialId}  draftDemand=${c.draftDemandId ?? "—"}`,
    );
  }

  const visit = chooseVisit(candidates);
  if (!visit) {
    console.error("No se pudo seleccionar una visita candidata.");
    process.exit(2);
  }
  console.log(`\nSelected visit: ${visit.id} (state=${visit.state}, slot=${fmt(visit.confirmedSlotStart)})`);

  const plan = await planBackfill(visit, opts);
  console.log(`\nPlan: ${plan.action}`);
  console.log(`Reason: ${plan.reason}`);
  console.log(`visitDateTime que usará la ParteVisitaSession: ${fmt(plan.visitDateTime)}\n`);

  if (plan.action === "ALREADY_SENT_NO_ACTION") {
    console.log("Nada que hacer. Pasa --force para resetear y reenviar de todas formas.");
    return;
  }

  if (!opts.confirm) {
    console.log("DRY-RUN: no se aplican cambios. Re-ejecuta con --confirm para aplicar.");
    return;
  }

  const result = await applyBackfill(visit, plan);
  console.log(`\nAplicado:`);
  console.log(`  ParteVisitaSession id : ${result.sessionId}`);
  console.log(`  Job encolado id       : ${result.jobId}`);
  console.log(`  availableAt           : NOW (procesable inmediatamente)`);

  if (opts.process) {
    console.log("\nEjecutando ciclos del consumer in-process...");
    await processInline(result.jobId);
  } else {
    console.log(
      "\nDeja correr al worker en background o re-ejecuta con --process para procesar in-process.",
    );
  }

  if (opts.simulate && opts.process) {
    const phone = visit.buyerWaId;
    const simulationEvents = await prisma.event.findMany({
      where: {
        type: "WHATSAPP_ENVIADO",
        aggregateType: "WHATSAPP_CONVERSATION",
        aggregateId: phone,
        occurredAt: { gte: simulationStartedAt },
      },
      orderBy: { occurredAt: "desc" },
      select: {
        id: true,
        position: true,
        occurredAt: true,
        payload: true,
      },
    });
    console.log(`\nValidación trazabilidad conversaciones (aggregateId=${phone}):`);
    console.log(`  - Mensajes interceptados WA      : ${intercepted.length}`);
    console.log(`  - Eventos WHATSAPP_ENVIADO creados: ${simulationEvents.length}`);
    for (const ev of simulationEvents) {
      const p = ev.payload as Record<string, unknown> | null;
      const messageType = p?.messageType ?? "—";
      const source = p?.source ?? "—";
      const kind = p?.kind ?? "—";
      console.log(
        `    · ${ev.occurredAt.toISOString()}  type=${messageType}  source=${source}  kind=${kind}  position=${ev.position}`,
      );
    }
    const hasParteEvent = simulationEvents.some((e) => {
      const p = e.payload as Record<string, unknown> | null;
      return p?.source === "parte_visita";
    });
    if (hasParteEvent) {
      console.log(
        "\n  ✓ Evento WHATSAPP_ENVIADO con source=parte_visita registrado → aparecerá en la UI de Conversaciones.",
      );
    } else {
      console.log(
        "\n  ✗ NO se encontró un WHATSAPP_ENVIADO con source=parte_visita. Revisa la propagación de trace.",
      );
    }

    // Limpieza: borra eventos sintéticos creados por --simulate y deja la
    // ParteVisitaSession en PENDING para que el envío real (sin --simulate)
    // pueda procesarse limpiamente.
    if (simulationEvents.length > 0) {
      const ids = simulationEvents.map((e) => e.id);
      const deleted = await prisma.event.deleteMany({
        where: { id: { in: ids } },
      });
      console.log(
        `\n  Limpieza: eliminados ${deleted.count} eventos WHATSAPP_ENVIADO sintéticos creados por --simulate.`,
      );
    }
    await prisma.parteVisitaSession.update({
      where: { id: result.sessionId },
      data: { state: "PENDING" },
    });
    console.log(`  Limpieza: ParteVisitaSession ${result.sessionId} restaurada a PENDING.`);
  }

  setTestSendInterceptor(null);
}

main()
  .catch((err) => {
    console.error("[backfill-parte-visita] ERROR:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
