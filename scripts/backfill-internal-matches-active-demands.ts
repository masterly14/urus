/**
 * Backfill manual del cruce automático contra cartera interna.
 *
 * Contexto: hasta esta corrida, una demanda nueva (`DEMANDA_CREADA`) no
 * generaba `MATCH_GENERADO` contra `properties_current` — la cartera interna
 * solo se cruzaba cuando entraba una propiedad nueva (`handlePropertyMatching`)
 * o cuando CEO/Admin lanzaba un rematch manual. Este script encola
 * `MATCH_DEMAND_AGAINST_INTERNAL` para las demandas vivas que no tienen un
 * match reciente, alineándolas con el nuevo comportamiento sin esperar a que
 * el comprador modifique criterios.
 *
 * Modo por defecto: dry-run. Usa --apply para escribir.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/backfill-internal-matches-active-demands.ts
 *   npx tsx --env-file=.env scripts/backfill-internal-matches-active-demands.ts --limit=50
 *   npx tsx --env-file=.env scripts/backfill-internal-matches-active-demands.ts --apply
 *   npx tsx --env-file=.env scripts/backfill-internal-matches-active-demands.ts --apply --limit=5
 *   npx tsx --env-file=.env scripts/backfill-internal-matches-active-demands.ts --codigos=40023945,40023619
 */
import { prisma } from "../lib/prisma";
import { enqueueJob } from "../lib/job-queue";

type Args = {
  apply: boolean;
  limit: number;
  codigos: string[] | null;
  comercialId: string | null;
  recentWindowHours: number;
};

function parseArgs(argv: string[]): Args {
  let apply = false;
  let limit = 20;
  let codigos: string[] | null = null;
  let comercialId: string | null = null;
  let recentWindowHours = 24;

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
    if (arg.startsWith("--comercialId=")) {
      const raw = arg.slice("--comercialId=".length).trim();
      if (raw) comercialId = raw;
      continue;
    }
    if (arg.startsWith("--recentWindowHours=")) {
      const n = parseInt(arg.slice("--recentWindowHours=".length), 10);
      if (Number.isFinite(n) && n > 0) recentWindowHours = n;
      continue;
    }
  }

  return { apply, limit, codigos, comercialId, recentWindowHours };
}

type Candidate = {
  codigo: string;
  ref: string;
  nombre: string;
  telefono: string;
  leadStatus: string;
  tipoOperacion: string | null;
  comercialId: string | null;
  lastEventId: string;
  lastEventAt: Date;
  recentMatchAt: Date | null;
  recentMatchScore: number | null;
};

async function findCandidates(args: Args): Promise<Candidate[]> {
  const whereCodigos =
    args.codigos && args.codigos.length > 0
      ? { codigo: { in: args.codigos } }
      : {};
  const whereComercial = args.comercialId
    ? { comercialId: args.comercialId }
    : {};

  // Diagnóstico: el handler MATCH_DEMAND_AGAINST_INTERNAL hace skip cuando
  // `tipoOperacion` es null (mismo contrato que rebuild-matches-handler).
  // Sin saber si la demanda es venta o alquiler, el matching no puede
  // aplicar el filtro hard `operationMatches`. Reportamos cuántas
  // demandas se descartan por esa razón para que el operador lo entienda.
  const livesTotal = await prisma.demandCurrent.count({
    where: {
      ...whereCodigos,
      ...whereComercial,
      leadStatus: { notIn: ["CERRADO", "PERDIDO"] },
    },
  });
  const livesWithCriteria = await prisma.demandCurrent.count({
    where: {
      ...whereCodigos,
      ...whereComercial,
      leadStatus: { notIn: ["CERRADO", "PERDIDO"] },
      OR: [{ presupuestoMax: { gt: 0 } }, { zonas: { not: "" } }],
    },
  });
  const livesWithCriteriaAndTipoOp = await prisma.demandCurrent.count({
    where: {
      ...whereCodigos,
      ...whereComercial,
      leadStatus: { notIn: ["CERRADO", "PERDIDO"] },
      tipoOperacion: { not: null },
      OR: [{ presupuestoMax: { gt: 0 } }, { zonas: { not: "" } }],
    },
  });
  console.log(
    `[backfill-match-internal] funnel: vivas=${livesTotal} → con_criterios=${livesWithCriteria} → con_tipoOperacion=${livesWithCriteriaAndTipoOp}`,
  );
  if (livesWithCriteria > 0 && livesWithCriteriaAndTipoOp === 0) {
    console.log(
      `[backfill-match-internal] aviso: ninguna demanda viva tiene tipoOperacion populated. ` +
        `El handler real haría skip por la misma razón. tipoOperacion se rellena vía NLU; ` +
        `el backfill no puede sortear este filtro porque el motor de matching exige operación.`,
    );
  }

  const demands = await prisma.demandCurrent.findMany({
    where: {
      ...whereCodigos,
      ...whereComercial,
      leadStatus: { notIn: ["CERRADO", "PERDIDO"] },
      tipoOperacion: { not: null },
      OR: [
        { presupuestoMax: { gt: 0 } },
        { zonas: { not: "" } },
      ],
    },
    select: {
      codigo: true,
      ref: true,
      nombre: true,
      telefono: true,
      leadStatus: true,
      tipoOperacion: true,
      comercialId: true,
      lastEventId: true,
      lastEventAt: true,
    },
    orderBy: { lastEventAt: "desc" },
  });

  if (demands.length === 0) return [];

  const cutoff = new Date(Date.now() - args.recentWindowHours * 3600 * 1000);
  const codigos = demands.map((d) => d.codigo);

  // Match recientes por demanda (en últimas N horas, vía aggregateId
  // `${demandId}:%`). Hacemos una consulta amplia y agrupamos en memoria.
  const recentMatches = await prisma.event.findMany({
    where: {
      type: "MATCH_GENERADO",
      occurredAt: { gte: cutoff },
      OR: codigos.map((c) => ({ aggregateId: { startsWith: `${c}:` } })),
    },
    select: { aggregateId: true, occurredAt: true, payload: true },
    orderBy: { occurredAt: "desc" },
  });

  const lastByDemand = new Map<string, { at: Date; score: number | null }>();
  for (const evt of recentMatches) {
    const demandId = evt.aggregateId.split(":")[0];
    if (!demandId) continue;
    if (!lastByDemand.has(demandId)) {
      const payload = (evt.payload ?? null) as Record<string, unknown> | null;
      const score =
        payload && typeof payload.totalScore === "number"
          ? (payload.totalScore as number)
          : null;
      lastByDemand.set(demandId, { at: evt.occurredAt, score });
    }
  }

  const candidates: Candidate[] = [];
  for (const d of demands) {
    const recent = lastByDemand.get(d.codigo);
    if (recent) continue; // ya tiene match reciente, no re-encolar
    candidates.push({
      codigo: d.codigo,
      ref: d.ref,
      nombre: d.nombre,
      telefono: d.telefono,
      leadStatus: d.leadStatus,
      tipoOperacion: d.tipoOperacion,
      comercialId: d.comercialId,
      lastEventId: d.lastEventId,
      lastEventAt: d.lastEventAt,
      recentMatchAt: null,
      recentMatchScore: null,
    });
  }

  return candidates.slice(0, args.limit);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `[backfill-match-internal] mode=${args.apply ? "APPLY" : "DRY-RUN"} ` +
      `limit=${args.limit} recentWindowHours=${args.recentWindowHours}` +
      (args.codigos ? ` codigos=${args.codigos.join(",")}` : "") +
      (args.comercialId ? ` comercialId=${args.comercialId}` : ""),
  );

  const candidates = await findCandidates(args);
  console.log(`[backfill-match-internal] candidatas: ${candidates.length}`);

  if (candidates.length === 0) {
    console.log("[backfill-match-internal] No hay demandas elegibles.");
    return;
  }

  console.log();
  console.log(
    "codigo".padEnd(12) +
      " | " +
      "operación".padEnd(10) +
      " | " +
      "status".padEnd(18) +
      " | " +
      "telefono".padEnd(15) +
      " | " +
      "nombre",
  );
  console.log("-".repeat(110));

  let enqueued = 0;
  const now = Date.now();
  for (const c of candidates) {
    console.log(
      c.codigo.padEnd(12) +
        " | " +
        (c.tipoOperacion ?? "?").padEnd(10) +
        " | " +
        c.leadStatus.padEnd(18) +
        " | " +
        (c.telefono || "-").padEnd(15) +
        " | " +
        c.nombre,
    );

    if (!args.apply) continue;

    const idempotencyKey = `match_internal:backfill:${c.codigo}:${now}`;
    const job = await enqueueJob({
      type: "MATCH_DEMAND_AGAINST_INTERNAL",
      payload: {
        demandId: c.codigo,
        source: "auto_demand_creada",
        sourceEventId: c.lastEventId,
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
    console.log(
      `[backfill-match-internal] encolados: ${enqueued} job(s) MATCH_DEMAND_AGAINST_INTERNAL`,
    );
    console.log(
      `[backfill-match-internal] El consumer procesará los jobs en el próximo ciclo (cron /api/cron/consumer o scripts/run-consumer.ts).`,
    );
  } else {
    console.log(
      `[backfill-match-internal] DRY-RUN. Nada encolado. Para ejecutar de verdad: añade --apply`,
    );
  }
}

main()
  .catch((err) => {
    console.error("[backfill-match-internal] error:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
