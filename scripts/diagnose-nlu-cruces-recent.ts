/**
 * Diagnóstico read-only de demandas recientes:
 * - Estado de demand_current
 * - Snapshots (lastSeenAt, firstSeenAt)
 * - Eventos relacionados (DEMANDA_CREADA, NLU_CONTACTO_INICIADO, MATCH_GENERADO)
 * - Jobs pendientes (PROCESS_EVENT, UPDATE_DEMAND_PROJECTION, EVALUATE_DEMAND_COVERAGE)
 * - Microsite selections asociadas
 *
 * Uso: npx tsx scripts/diagnose-nlu-cruces-recent.ts [telefono1 telefono2 ...]
 * Si no se pasan teléfonos, lista las 10 últimas demandas sincronizadas.
 */

import { prisma } from "@/lib/prisma";

type TargetDemand = {
  codigo: string;
  nombre: string;
  telefono: string;
  leadStatus: string;
  comercialId: string | null;
  agente: string;
  fechaActualizacion: string;
  lastEventAt: Date | null;
  updatedAt: Date;
};

async function findTargets(args: string[]): Promise<TargetDemand[]> {
  if (args.length === 0) {
    const rows = await prisma.demandSnapshot.findMany({
      orderBy: [{ lastSeenAt: "desc" }, { updatedAt: "desc" }],
      take: 10,
      select: { codigo: true },
    });
    const codes = rows.map((r) => r.codigo);
    return prisma.demandCurrent.findMany({
      where: { codigo: { in: codes } },
      select: {
        codigo: true,
        nombre: true,
        telefono: true,
        leadStatus: true,
        comercialId: true,
        agente: true,
        fechaActualizacion: true,
        lastEventAt: true,
        updatedAt: true,
      },
    });
  }

  const targets: TargetDemand[] = [];
  for (const raw of args) {
    const phone = raw.replace(/\D/g, "");
    const candidates = await prisma.demandCurrent.findMany({
      where: {
        OR: [
          { telefono: phone },
          { telefono: { endsWith: phone.slice(-9) } },
        ],
      },
      select: {
        codigo: true,
        nombre: true,
        telefono: true,
        leadStatus: true,
        comercialId: true,
        agente: true,
        fechaActualizacion: true,
        lastEventAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 3,
    });
    targets.push(...candidates);
  }
  return targets;
}

async function dumpDemand(d: TargetDemand): Promise<void> {
  console.log(`\n======================================================================`);
  console.log(`Demanda codigo=${d.codigo} nombre=${JSON.stringify(d.nombre)}`);
  console.log(
    `  telefono=${d.telefono} leadStatus=${d.leadStatus} agente=${JSON.stringify(d.agente)} comercialId=${d.comercialId ?? "null"}`,
  );
  console.log(
    `  fechaActualizacion=${d.fechaActualizacion} lastEventAt=${d.lastEventAt?.toISOString() ?? "null"} updatedAt=${d.updatedAt.toISOString()}`,
  );

  const snapshot = await prisma.demandSnapshot.findUnique({
    where: { codigo: d.codigo },
    select: {
      telefono: true,
      firstSeenAt: true,
      lastSeenAt: true,
      updatedAt: true,
    },
  });
  if (snapshot) {
    console.log(
      `  snapshot.telefono=${snapshot.telefono} firstSeenAt=${snapshot.firstSeenAt.toISOString()} lastSeenAt=${snapshot.lastSeenAt.toISOString()}`,
    );
  } else {
    console.log(`  snapshot: <none>`);
  }

  const events = await prisma.event.findMany({
    where: { aggregateId: d.codigo },
    orderBy: { position: "asc" },
    select: {
      id: true,
      type: true,
      occurredAt: true,
      position: true,
      payload: true,
    },
  });
  console.log(`  events total=${events.length}:`);
  for (const ev of events) {
    const payloadSummary =
      ev.type === "NLU_CONTACTO_INICIADO"
        ? (() => {
            const p = ev.payload as Record<string, unknown> | null;
            return ` sent=${p?.sent} skippedReason=${p?.skippedReason ?? "-"} source=${p?.source ?? "-"} waId=${p?.waId ?? "-"} dryRun=${p?.dryRun ?? false}`;
          })()
        : ev.type === "DEMANDA_CREADA"
          ? (() => {
              const p = ev.payload as { snapshot?: { telefono?: string; nombre?: string } } | null;
              return ` telefono=${p?.snapshot?.telefono ?? "-"} nombre=${p?.snapshot?.nombre ?? "-"}`;
            })()
          : "";
    console.log(`    [${ev.position.toString().padStart(7)}] ${ev.occurredAt.toISOString()} ${ev.type}${payloadSummary} (id=${ev.id})`);
  }

  const matches = await prisma.event.findMany({
    where: {
      type: "MATCH_GENERADO",
      payload: { path: ["demandId"], equals: d.codigo },
    },
    orderBy: { position: "desc" },
    take: 5,
    select: { id: true, occurredAt: true, payload: true },
  });
  console.log(`  matches (MATCH_GENERADO) total=${matches.length}:`);
  for (const m of matches) {
    const p = m.payload as Record<string, unknown> | null;
    console.log(
      `    ${m.occurredAt.toISOString()} property=${p?.propertyId ?? "?"} score=${p?.totalScore ?? "?"} source=${p?.source ?? "-"}`,
    );
  }

  const orClauses = [
    { payload: { path: ["demandId"], equals: d.codigo } },
    ...events.map((e) => ({
      AND: [
        { type: "PROCESS_EVENT" as const },
        { payload: { path: ["eventId"], equals: e.id } },
      ],
    })),
    ...events.map((e) => ({ sourceEventId: e.id })),
  ];
  const jobs = await prisma.jobQueue.findMany({
    where: { OR: orClauses },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      type: true,
      status: true,
      attempts: true,
      createdAt: true,
      availableAt: true,
      lastError: true,
      idempotencyKey: true,
      sourceEventId: true,
    },
  });
  console.log(`  jobs related total=${jobs.length}:`);
  for (const j of jobs) {
    console.log(
      `    ${j.createdAt.toISOString()} ${j.type} status=${j.status} attempts=${j.attempts} availableAt=${j.availableAt.toISOString()} src=${j.sourceEventId ?? "-"} key=${j.idempotencyKey ?? "-"}${j.lastError ? ` err=${j.lastError.slice(0, 120)}` : ""}`,
    );
  }

  const selections = await prisma.micrositeSelection.findMany({
    where: { demandId: d.codigo },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      status: true,
      sourceEventId: true,
      createdAt: true,
      stockCount: true,
      token: true,
    },
  });
  console.log(`  microsite selections total=${selections.length}:`);
  for (const s of selections) {
    console.log(
      `    ${s.createdAt.toISOString()} status=${s.status} stock=${s.stockCount} sourceEventId=${s.sourceEventId ?? "-"} token=${s.token}`,
    );
  }

  if (d.telefono) {
    const session = await prisma.whatsAppBuyerSession.findUnique({
      where: { waId: d.telefono.replace(/[^\d+]/g, "") },
      select: {
        waId: true,
        demandId: true,
        conversationPhase: true,
        lastMessageAt: true,
        turnCount: true,
        updatedAt: true,
      },
    });
    if (session) {
      console.log(
        `  whatsapp session waId=${session.waId} demandId=${session.demandId} phase=${session.conversationPhase} turns=${session.turnCount} lastMessageAt=${session.lastMessageAt?.toISOString() ?? "null"} updatedAt=${session.updatedAt.toISOString()}`,
      );
    } else {
      console.log(`  whatsapp session: <none>`);
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const targets = await findTargets(args);
  if (targets.length === 0) {
    console.log("No se encontró ninguna demanda para los argumentos:", args);
    return;
  }
  for (const t of targets) {
    await dumpDemand(t);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await (prisma as unknown as { $disconnect: () => Promise<void> }).$disconnect();
  });
