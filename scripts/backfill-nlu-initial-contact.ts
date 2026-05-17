/**
 * Backfill manual del primer contacto NLU.
 *
 * Contexto: hasta ahora el handler de `DEMANDA_CREADA` invocaba inline
 * `handleDemandaCreadaNluInitialContact`, que leía `demand_current` antes de
 * que el job asíncrono `UPDATE_DEMAND_PROJECTION` hubiera terminado. El
 * resultado era `NLU_CONTACTO_INICIADO sent=false skippedReason=demand_not_found`
 * y la demanda quedaba sin contacto automático. Además, `DEMANDA_MODIFICADA`
 * tampoco disparaba NLU cuando aparecía un teléfono nuevo (caso reconciliación
 * desde la REST API de Inmovilla).
 *
 * Este script identifica las demandas vivas (no terminales) con teléfono y sin
 * un `NLU_CONTACTO_INICIADO sent=true` previo, y encola un job
 * `START_NLU_INITIAL_CONTACT` para cada una. El job handler se encarga de la
 * idempotencia por demanda (re-chequeo en el Event Store antes de enviar).
 *
 * Modo por defecto: dry-run (no encola). Usa --apply para escribir.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/backfill-nlu-initial-contact.ts
 *   npx tsx --env-file=.env scripts/backfill-nlu-initial-contact.ts --limit=50
 *   npx tsx --env-file=.env scripts/backfill-nlu-initial-contact.ts --apply
 *   npx tsx --env-file=.env scripts/backfill-nlu-initial-contact.ts --apply --limit=5
 *   npx tsx --env-file=.env scripts/backfill-nlu-initial-contact.ts --codigos=40023945,40023619
 */
import { prisma } from "../lib/prisma";
import { enqueueJob } from "../lib/job-queue";

type Args = {
  apply: boolean;
  limit: number;
  codigos: string[] | null;
};

function parseArgs(argv: string[]): Args {
  let apply = false;
  let limit = 20;
  let codigos: string[] | null = null;

  for (const arg of argv) {
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--dry-run") {
      apply = false;
      continue;
    }
    if (arg.startsWith("--limit=")) {
      const n = parseInt(arg.slice("--limit=".length), 10);
      if (Number.isFinite(n) && n > 0) limit = n;
      continue;
    }
    if (arg.startsWith("--codigos=")) {
      const raw = arg.slice("--codigos=".length);
      codigos = raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      continue;
    }
  }

  return { apply, limit, codigos };
}

type Candidate = {
  codigo: string;
  nombre: string;
  telefono: string;
  leadStatus: string;
  lastEventId: string;
  lastEventAt: Date;
  lastNluContactEventId: string | null;
  lastNluContactSent: boolean | null;
  lastNluContactSkippedReason: string | null;
  lastNluContactAt: Date | null;
};

async function findCandidates(args: Args): Promise<Candidate[]> {
  const whereCodigos = args.codigos && args.codigos.length > 0
    ? { codigo: { in: args.codigos } }
    : {};

  const demands = await prisma.demandCurrent.findMany({
    where: {
      ...whereCodigos,
      telefono: { not: "" },
      leadStatus: { notIn: ["CERRADO", "PERDIDO"] },
    },
    select: {
      codigo: true,
      nombre: true,
      telefono: true,
      leadStatus: true,
      lastEventId: true,
      lastEventAt: true,
    },
    orderBy: { lastEventAt: "desc" },
  });

  if (demands.length === 0) return [];

  const codigos = demands.map((d) => d.codigo);

  // Para cada demanda, ¿hay un NLU_CONTACTO_INICIADO sent=true previo?
  // Usamos groupBy/findMany por aggregateId. Más simple: una query con
  // findMany y agrupar en memoria (volumen esperado < 1k demandas).
  const sentEvents = await prisma.event.findMany({
    where: {
      type: "NLU_CONTACTO_INICIADO",
      aggregateId: { in: codigos },
      payload: { path: ["sent"], equals: true },
    },
    select: { aggregateId: true, id: true },
  });
  const sentByAggregate = new Set(sentEvents.map((e) => e.aggregateId));

  const allNluEvents = await prisma.event.findMany({
    where: {
      type: "NLU_CONTACTO_INICIADO",
      aggregateId: { in: codigos },
    },
    select: {
      id: true,
      aggregateId: true,
      payload: true,
      occurredAt: true,
    },
    orderBy: { occurredAt: "desc" },
  });
  const lastNluByAggregate = new Map<string, (typeof allNluEvents)[number]>();
  for (const evt of allNluEvents) {
    if (!lastNluByAggregate.has(evt.aggregateId)) {
      lastNluByAggregate.set(evt.aggregateId, evt);
    }
  }

  const candidates: Candidate[] = [];
  for (const d of demands) {
    if (sentByAggregate.has(d.codigo)) continue;
    const lastNlu = lastNluByAggregate.get(d.codigo) ?? null;
    const payload = (lastNlu?.payload ?? null) as Record<string, unknown> | null;
    candidates.push({
      codigo: d.codigo,
      nombre: d.nombre,
      telefono: d.telefono,
      leadStatus: d.leadStatus,
      lastEventId: d.lastEventId,
      lastEventAt: d.lastEventAt,
      lastNluContactEventId: lastNlu?.id ?? null,
      lastNluContactSent:
        payload && typeof payload.sent === "boolean" ? (payload.sent as boolean) : null,
      lastNluContactSkippedReason:
        payload && typeof payload.skippedReason === "string"
          ? (payload.skippedReason as string)
          : null,
      lastNluContactAt: lastNlu?.occurredAt ?? null,
    });
  }

  return candidates.slice(0, args.limit);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `[backfill-nlu] mode=${args.apply ? "APPLY" : "DRY-RUN"} limit=${args.limit}` +
      (args.codigos ? ` codigos=${args.codigos.join(",")}` : ""),
  );

  const candidates = await findCandidates(args);
  console.log(`[backfill-nlu] candidatas: ${candidates.length}`);

  if (candidates.length === 0) {
    console.log("[backfill-nlu] No hay demandas elegibles.");
    return;
  }

  console.log();
  console.log(
    "codigo".padEnd(12) +
      " | " +
      "telefono".padEnd(15) +
      " | " +
      "status".padEnd(10) +
      " | " +
      "previo NLU".padEnd(28) +
      " | " +
      "nombre",
  );
  console.log("-".repeat(110));

  let enqueued = 0;
  const now = Date.now();
  for (const c of candidates) {
    const previo = c.lastNluContactEventId
      ? `${c.lastNluContactSent === true ? "sent" : "skipped"}:${c.lastNluContactSkippedReason ?? "-"}`
      : "(sin evento previo)";

    console.log(
      c.codigo.padEnd(12) +
        " | " +
        c.telefono.padEnd(15) +
        " | " +
        c.leadStatus.padEnd(10) +
        " | " +
        previo.padEnd(28) +
        " | " +
        c.nombre,
    );

    if (!args.apply) continue;

    const idempotencyKey = `nlu_initial_contact:backfill:${c.codigo}:${now}`;
    const job = await enqueueJob({
      type: "START_NLU_INITIAL_CONTACT",
      payload: {
        demandId: c.codigo,
        source: "backfill",
        causationId: c.lastEventId,
        correlationId: null,
      },
      idempotencyKey,
      sourceEventId: c.lastEventId,
    });
    enqueued++;
    console.log(`  → jobId=${job.id} idempotencyKey=${idempotencyKey}`);
  }

  console.log();
  if (args.apply) {
    console.log(`[backfill-nlu] encolados: ${enqueued} job(s) START_NLU_INITIAL_CONTACT`);
    console.log(
      `[backfill-nlu] El consumer procesará los jobs en el próximo ciclo (cron /api/cron/consumer o scripts/run-consumer.ts).`,
    );
  } else {
    console.log(
      `[backfill-nlu] DRY-RUN. Nada encolado. Para ejecutar de verdad: añade --apply`,
    );
  }
}

main()
  .catch((err) => {
    console.error("[backfill-nlu] error:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
