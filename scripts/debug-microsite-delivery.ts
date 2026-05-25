import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Args = {
  demandId?: string;
  waId?: string;
  json: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--json") {
      args.json = true;
      continue;
    }
    if (token === "--demandId") {
      args.demandId = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--waId") {
      args.waId = argv[i + 1];
      i += 1;
      continue;
    }
  }
  return args;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function summarizeEventPayload(payload: unknown): Record<string, unknown> {
  const p = asObject(payload);
  return {
    kind: p.kind ?? null,
    source: p.source ?? null,
    status: p.status ?? null,
    reason: p.reason ?? null,
    decision: p.decision ?? null,
    jobId: p.jobId ?? null,
    demandId: p.demandId ?? null,
    selectionId: p.selectionId ?? null,
    messageId: p.messageId ?? null,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.demandId && !args.waId) {
    throw new Error("Uso: tsx scripts/debug-microsite-delivery.ts --demandId <id> [--json] o --waId <waId> [--json]");
  }

  const session = args.waId
    ? await prisma.whatsAppBuyerSession.findUnique({
        where: { waId: args.waId },
        select: {
          waId: true,
          demandId: true,
          selectionId: true,
          selectionToken: true,
          conversationPhase: true,
          turnCount: true,
          lastMessageAt: true,
          updatedAt: true,
        },
      })
    : null;

  const demandId = args.demandId ?? session?.demandId ?? null;
  if (!demandId) {
    throw new Error(`No se pudo resolver demandId para waId=${args.waId ?? "N/A"}`);
  }

  const demand = await prisma.demandCurrent.findUnique({
    where: { codigo: demandId },
    select: {
      codigo: true,
      nombre: true,
      telefono: true,
      tipos: true,
      zonas: true,
      presupuestoMin: true,
      presupuestoMax: true,
      habitacionesMin: true,
      leadStatus: true,
    },
  });

  const waId = args.waId ?? text(demand?.telefono) ?? session?.waId ?? null;

  const selections = await prisma.micrositeSelection.findMany({
    where: { demandId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      token: true,
      status: true,
      source: true,
      sourceEventId: true,
      buyerPhone: true,
      stockCount: true,
      properties: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const selectionIds = selections.map((s) => s.id);

  const generateJobs = await prisma.jobQueue.findMany({
    where: {
      type: "GENERATE_MICROSITE",
      payload: { path: ["demandId"], equals: demandId },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      type: true,
      status: true,
      attempts: true,
      maxAttempts: true,
      lastError: true,
      idempotencyKey: true,
      sourceEventId: true,
      createdAt: true,
      startedAt: true,
      completedAt: true,
      failedAt: true,
      payload: true,
    },
  });

  const sendJobs = selectionIds.length
    ? await prisma.jobQueue.findMany({
        where: {
          type: "SEND_MICROSITE_TO_BUYER",
          OR: selectionIds.map((selectionId) => ({
            payload: { path: ["selectionId"], equals: selectionId },
          })),
        },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          type: true,
          status: true,
          attempts: true,
          lastError: true,
          idempotencyKey: true,
          sourceEventId: true,
          createdAt: true,
          startedAt: true,
          completedAt: true,
          failedAt: true,
          payload: true,
        },
      })
    : [];

  const aggregateFilters = [
    { aggregateType: "DEMAND" as const, aggregateId: demandId },
    ...(waId ? [{ aggregateType: "WHATSAPP_CONVERSATION" as const, aggregateId: waId }] : []),
  ];
  const events = await prisma.event.findMany({
    where: { OR: aggregateFilters },
    orderBy: { occurredAt: "desc" },
    take: 80,
    select: {
      id: true,
      type: true,
      aggregateType: true,
      aggregateId: true,
      occurredAt: true,
      payload: true,
    },
  });

  const resultEvents = events.filter((event) =>
    ["MICROSITE_GENERACION_RESULTADO", "COBERTURA_DEMANDA_EVALUADA"].includes(event.type),
  );
  const micrositeSends = events.filter((event) => {
    const payload = asObject(event.payload);
    return event.type === "WHATSAPP_ENVIADO" && payload.kind === "microsite_link";
  });
  const delayNotices = events.filter((event) => {
    const payload = asObject(event.payload);
    return event.type === "WHATSAPP_ENVIADO" && payload.kind === "microsite_generation_delayed";
  });
  const noStockNotices = events.filter((event) => {
    const payload = asObject(event.payload);
    return event.type === "WHATSAPP_ENVIADO" && payload.kind === "no_stock_available";
  });

  const latestResultPayload = resultEvents[0] ? asObject(resultEvents[0].payload) : null;
  const diagnosis = {
    demandId,
    waId,
    hasSelection: selections.length > 0,
    hasMicrositeSend: micrositeSends.length > 0,
    hasDelayNotice: delayNotices.length > 0,
    hasNoStockNotice: noStockNotices.length > 0,
    latestResult: latestResultPayload
      ? {
          eventType: resultEvents[0].type,
          status: latestResultPayload.status ?? null,
          decision: latestResultPayload.decision ?? null,
          reason: latestResultPayload.reason ?? null,
          jobId: latestResultPayload.jobId ?? null,
          occurredAt: resultEvents[0].occurredAt,
        }
      : null,
    likelyCause:
      selections.length > 0 && micrositeSends.length > 0
        ? "microsite_sent"
        : latestResultPayload?.reason ?? latestResultPayload?.decision ?? "no_result_event_found",
  };

  const report = {
    diagnosis,
    demand,
    session,
    selections: selections.map((selection) => ({
      ...selection,
      propertiesCount: Array.isArray(selection.properties) ? selection.properties.length : null,
      properties: undefined,
    })),
    generateJobs,
    sendJobs,
    relevantEvents: events.map((event) => ({
      id: event.id,
      type: event.type,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      occurredAt: event.occurredAt,
      payload: summarizeEventPayload(event.payload),
    })),
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("=== Diagnóstico microsite ===");
  console.log(JSON.stringify(diagnosis, null, 2));
  console.log("\n=== Demanda ===");
  console.log(JSON.stringify(demand, null, 2));
  console.log("\n=== Sesión WhatsApp ===");
  console.log(JSON.stringify(session, null, 2));
  console.log("\n=== Jobs GENERATE_MICROSITE ===");
  console.log(JSON.stringify(generateJobs, null, 2));
  console.log("\n=== Selecciones ===");
  console.log(JSON.stringify(report.selections, null, 2));
  console.log("\n=== Jobs SEND_MICROSITE_TO_BUYER ===");
  console.log(JSON.stringify(sendJobs, null, 2));
  console.log("\n=== Eventos relevantes ===");
  console.log(JSON.stringify(report.relevantEvents, null, 2));
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
