import "dotenv/config";
import type { EventType, JobType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ACTIVE_DEMAND_STATES } from "@/lib/matching";
import { isExternalPortfolioSearchEnabled } from "@/lib/statefox/external-search";
import { normalizeWhatsAppDigits } from "@/lib/microsite/buyer-phone";

const DEFAULT_DAYS = 7;
const DEFAULT_LIMIT = 20;
const UI_DEFAULT_LIMIT = 30;
const API_MAX_LIMIT = 100;
const SCORE_DELTA_THRESHOLD = 5;
const COVERAGE_COOLDOWN_DAYS = Number(process.env.MATCHING_COVERAGE_COOLDOWN_DAYS ?? 7);

const CRITICAL_JOB_TYPES = [
  "PROCESS_EVENT",
  "MATCH_DEMAND_AGAINST_INTERNAL",
  "EVALUATE_DEMAND_COVERAGE",
  "GENERATE_MICROSITE",
  "SEND_MICROSITE_TO_BUYER",
] satisfies JobType[];

const DEMAND_EVENT_TYPES = [
  "DEMANDA_CREADA",
  "DEMANDA_MODIFICADA",
  "DEMANDA_ACTUALIZADA",
  "DEMANDA_ESTADO_CAMBIADO",
  "DEMANDA_ELIMINADA",
] satisfies EventType[];

type CliOptions = {
  demandId: string | null;
  days: number;
  since: Date;
  limit: number;
  json: boolean;
};

type SourceBreakdown = Record<string, number>;

type DemandAudit = {
  demandId: string;
  current: {
    found: boolean;
    nombre: string | null;
    estadoId: string | null;
    leadStatus: string | null;
    tipoOperacion: string | null;
    telefonoPresent: boolean;
    zonasPresent: boolean;
    tiposPresent: boolean;
    presupuestoPresent: boolean;
    metrosPresent: boolean;
    habitacionesPresent: boolean;
    updatedAt: string | null;
  };
  eligibility: {
    activeState: boolean;
    hasTipoOperacion: boolean;
    hasBuyerPhone: boolean;
    hasSearchCriteria: boolean;
    blockers: string[];
    warnings: string[];
  };
  events: {
    demandEvents: EventLine[];
    matchEventsCount: number;
    matchSourceBreakdown: SourceBreakdown;
    latestMatchEvents: MatchLine[];
    selectionEvents: EventLine[];
    whatsappEvents: EventLine[];
  };
  jobs: {
    relatedCount: number;
    statusBreakdown: Record<string, number>;
    latest: JobLine[];
  };
  microsites: {
    count: number;
    recentCoverageDedup: boolean;
    latest: MicrositeLine[];
  };
  whatsappMessages: {
    buyerWaId: string | null;
    outboundCount: number;
    inboundCount: number;
    matchedByDemandIdCount: number;
    matchedByPhoneCount: number;
    latest: WhatsAppMessageLine[];
  };
  likelyCut: string;
};

type EventLine = {
  id: string;
  type: string;
  position: string;
  createdAt: string;
  causationId: string | null;
  correlationId: string | null;
  payloadSummary: Record<string, unknown>;
};

type MatchLine = EventLine & {
  propertyId: string | null;
  totalScore: number | null;
  source: string;
};

type JobLine = {
  id: string;
  type: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  availableAt: string;
  sourceEventId: string | null;
  idempotencyKey: string | null;
  lastError: string | null;
  payloadSummary: Record<string, unknown>;
};

type MicrositeLine = {
  id: string;
  token: string;
  status: string;
  source: string | null;
  sourceEventId: string | null;
  stockCount: number;
  propertiesCount: number;
  buyerPhonePresent: boolean;
  createdAt: string;
  updatedAt: string;
};

type WhatsAppMessageLine = {
  id: string;
  waId: string;
  direction: "inbound" | "outbound";
  kind: string | null;
  source: string | null;
  messageId: string | null;
  templateName: string | null;
  demandId: string | null;
  selectionId: string | null;
  propertyId: string | null;
  createdAt: string;
  occurredAt: string;
  causationId: string | null;
  preview: string;
  matchReason: "payload.demandId" | "aggregateId.phone" | "both";
};

type AuditReport = {
  generatedAt: string;
  filters: {
    demandId: string | null;
    since: string;
    days: number;
    demandLimit: number;
  };
  environment: {
    databaseUrlConfigured: boolean;
    externalPortfolioSearchEnabled: boolean;
    statefoxTokenConfigured: boolean;
    openAiKeyConfigured: boolean;
    nextPublicAppUrlConfigured: boolean;
    coverageCooldownDays: number;
  };
  crucesUiVsDb: {
    dbTotalMatchGenerado: number;
    dbMatchesSince: number;
    uiDefaultLimit: number;
    apiMaxLimit: number;
    firstPageVisibleCount: number;
    firstHundredVisibleCount: number;
    hasMoreThanThirty: boolean;
    latest30NewestAt: string | null;
    latest30OldestAt: string | null;
    latestSourceBreakdownSince: SourceBreakdown;
    conclusion: string;
  };
  criticalJobs: {
    since: string;
    totalRecent: number;
    statusByType: Record<string, Record<string, number>>;
    oldestPending: JobLine | null;
    recentFailures: JobLine[];
  };
  recentRematchRuns: Array<{
    id: string;
    status: string;
    totalDemands: number;
    totalBatches: number;
    demandsProcessed: number;
    matchesEmitted: number;
    matchesSkipped: number;
    startedAt: string;
    updatedAt: string;
    errorMessage: string | null;
  }>;
  conversationsUi: {
    defaultListLimit: number;
    maxListLimit: number;
    totalConversationWaIds: number;
    totalMessages: number;
    outboundMessages: number;
    inboundMessages: number;
    conversationsWithOutbound: number;
    conversationsWithInbound: number;
    visibleConversationCountAtDefaultLimit: number;
    visibleConversationCountAtMaxLimit: number;
    explanation: string;
  };
  demands: DemandAudit[];
  overallFindings: string[];
};

function parseArgs(argv: string[]): CliOptions {
  let demandId: string | null = null;
  let days = DEFAULT_DAYS;
  let since: Date | null = null;
  let limit = DEFAULT_LIMIT;
  let json = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--demand" || arg === "--demand-id") {
      const value = argv[i + 1];
      if (value && !value.startsWith("--")) {
        demandId = value;
        i++;
      }
      continue;
    }

    if (arg === "--days") {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value) && value >= 0) {
        days = Math.floor(value);
        i++;
      }
      continue;
    }

    if (arg === "--since") {
      const value = argv[i + 1];
      if (value && !value.startsWith("--")) {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
          since = parsed;
          i++;
        }
      }
      continue;
    }

    if (arg === "--limit") {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value) && value > 0) {
        limit = Math.floor(value);
        i++;
      }
      continue;
    }

    if (arg === "--json") {
      json = true;
      continue;
    }
  }

  const resolvedSince =
    since ?? (days <= 0 ? new Date(0) : new Date(Date.now() - days * 24 * 60 * 60 * 1000));

  return {
    demandId,
    days,
    since: resolvedSince,
    limit,
    json,
  };
}

function payloadRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

function summarizePayload(payload: unknown): Record<string, unknown> {
  const p = payloadRecord(payload);
  const source = typeof p.source === "string" ? p.source : undefined;
  const demandId = typeof p.demandId === "string" ? p.demandId : undefined;
  const propertyId = typeof p.propertyId === "string" ? p.propertyId : undefined;
  const eventId = typeof p.eventId === "string" ? p.eventId : undefined;
  const selectionId = typeof p.selectionId === "string" ? p.selectionId : undefined;
  const bestScoreOverride =
    typeof p.bestScoreOverride === "number" ? p.bestScoreOverride : undefined;
  const matchesEmitted = typeof p.matchesEmitted === "number" ? p.matchesEmitted : undefined;
  const coverageReason = typeof p.coverageReason === "string" ? p.coverageReason : undefined;
  const coverageBestScore =
    typeof p.coverageBestScore === "number" ? p.coverageBestScore : undefined;
  const kind = typeof p.kind === "string" ? p.kind : undefined;
  const skippedReason = typeof p.skippedReason === "string" ? p.skippedReason : undefined;

  return Object.fromEntries(
    Object.entries({
      eventId,
      demandId,
      propertyId,
      selectionId,
      source,
      kind,
      bestScoreOverride,
      matchesEmitted,
      coverageReason,
      coverageBestScore,
      skippedReason,
    }).filter(([, value]) => value !== undefined),
  );
}

function stringFrom(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function nestedRecord(value: unknown): Record<string, unknown> {
  return payloadRecord(value);
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const s = stringFrom(value);
    if (s) return s;
  }
  return null;
}

function messagePreview(payload: unknown): string {
  const p = payloadRecord(payload);
  const text = nestedRecord(p.text);
  const template = nestedRecord(p.template);
  const interactive = nestedRecord(p.interactive);
  const interactiveBody = nestedRecord(interactive.body);
  const buttonReply = nestedRecord(interactive.button_reply);
  const listReply = nestedRecord(interactive.list_reply);
  const raw = firstString(
    text.body,
    p.body,
    p.text,
    interactiveBody.text,
    buttonReply.title,
    listReply.title,
    p.kind ? `[${p.kind}]` : null,
    template.name ? `[template:${template.name}]` : null,
  ) ?? "[sin texto visible]";

  const oneLine = raw.replace(/\s+/g, " ").trim();
  return oneLine.length > 160 ? `${oneLine.slice(0, 157)}...` : oneLine;
}

function toWhatsAppMessageLine(
  event: {
    id: string;
    type: string;
    aggregateId: string;
    payload: unknown;
    createdAt: Date;
    occurredAt: Date;
    causationId: string | null;
  },
  matchReason: WhatsAppMessageLine["matchReason"],
): WhatsAppMessageLine {
  const p = payloadRecord(event.payload);
  const template = nestedRecord(p.template);
  return {
    id: event.id,
    waId: event.aggregateId,
    direction: event.type === "WHATSAPP_RECIBIDO" ? "inbound" : "outbound",
    kind: stringFrom(p.kind) ?? stringFrom(p.type) ?? stringFrom(p.messageType),
    source: stringFrom(p.source),
    messageId: firstString(p.messageId, p.waMessageId),
    templateName: stringFrom(template.name),
    demandId: stringFrom(p.demandId),
    selectionId: stringFrom(p.selectionId),
    propertyId: stringFrom(p.propertyId),
    createdAt: event.createdAt.toISOString(),
    occurredAt: event.occurredAt.toISOString(),
    causationId: event.causationId,
    preview: messagePreview(event.payload),
    matchReason,
  };
}

function toEventLine(event: {
  id: string;
  type: string;
  position: bigint;
  createdAt: Date;
  causationId: string | null;
  correlationId: string | null;
  payload: unknown;
}): EventLine {
  return {
    id: event.id,
    type: event.type,
    position: event.position.toString(),
    createdAt: event.createdAt.toISOString(),
    causationId: event.causationId,
    correlationId: event.correlationId,
    payloadSummary: summarizePayload(event.payload),
  };
}

function toMatchLine(event: {
  id: string;
  type: string;
  position: bigint;
  createdAt: Date;
  causationId: string | null;
  correlationId: string | null;
  payload: unknown;
}): MatchLine {
  const p = payloadRecord(event.payload);
  return {
    ...toEventLine(event),
    propertyId: typeof p.propertyId === "string" ? p.propertyId : null,
    totalScore: typeof p.totalScore === "number" ? p.totalScore : null,
    source: typeof p.source === "string" ? p.source : "(legacy)",
  };
}

function toJobLine(job: {
  id: string;
  type: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  availableAt: Date;
  sourceEventId: string | null;
  idempotencyKey: string | null;
  lastError: string | null;
  payload: unknown;
}): JobLine {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    createdAt: job.createdAt.toISOString(),
    availableAt: job.availableAt.toISOString(),
    sourceEventId: job.sourceEventId,
    idempotencyKey: job.idempotencyKey,
    lastError: job.lastError,
    payloadSummary: summarizePayload(job.payload),
  };
}

function sourceBreakdown(events: Array<{ payload: unknown }>): SourceBreakdown {
  const counts: SourceBreakdown = {};
  for (const event of events) {
    const p = payloadRecord(event.payload);
    const source = typeof p.source === "string" ? p.source : "(legacy)";
    counts[source] = (counts[source] ?? 0) + 1;
  }
  return counts;
}

function countByStatus(jobs: JobLine[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const job of jobs) {
    const key = `${job.type}:${job.status}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function countJobsByTypeAndStatus(
  jobs: Array<{ type: string; status: string }>,
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  for (const job of jobs) {
    result[job.type] ??= {};
    result[job.type][job.status] = (result[job.type][job.status] ?? 0) + 1;
  }
  return result;
}

function inferDemandCut(args: {
  currentFound: boolean;
  blockers: string[];
  demandEventsCount: number;
  relatedJobs: JobLine[];
  matchEventsCount: number;
  micrositeCount: number;
  latestMicrosite: MicrositeLine | null;
  recentCoverageDedup: boolean;
}): string {
  const {
    currentFound,
    blockers,
    demandEventsCount,
    relatedJobs,
    matchEventsCount,
    micrositeCount,
    latestMicrosite,
    recentCoverageDedup,
  } = args;

  if (!currentFound) return "No existe DemandCurrent para esta demanda.";
  if (blockers.length > 0) return `Demanda no elegible: ${blockers.join("; ")}.`;
  if (demandEventsCount === 0) return "No se encontraron eventos de demanda en la ventana/aggregateId.";

  const failed = relatedJobs.find((job) => job.status === "FAILED" || job.status === "DEAD_LETTER");
  if (failed) return `Job crítico fallido: ${failed.type} (${failed.status}) ${failed.lastError ?? ""}`.trim();

  const pendingCritical = relatedJobs.find(
    (job) => job.status === "PENDING" || job.status === "IN_PROGRESS",
  );
  if (pendingCritical) {
    return `Flujo pendiente en cola: ${pendingCritical.type} (${pendingCritical.status}).`;
  }

  const matchJob = relatedJobs.find((job) => job.type === "MATCH_DEMAND_AGAINST_INTERNAL");
  if (!matchJob) return "No se encontró job MATCH_DEMAND_AGAINST_INTERNAL relacionado.";
  if (matchEventsCount === 0) {
    return `Matching ejecutado sin nuevos MATCH_GENERADO; revisar dedup Δ<${SCORE_DELTA_THRESHOLD}, score bajo o ausencia de propiedades elegibles.`;
  }

  const coverageJob = relatedJobs.find((job) => job.type === "EVALUATE_DEMAND_COVERAGE");
  if (!coverageJob) return "Hay cruces, pero no se encontró EVALUATE_DEMAND_COVERAGE relacionado.";
  if (micrositeCount === 0) {
    if (recentCoverageDedup) return "Cobertura omitió microsite por selección coverage reciente.";
    return "Cobertura no generó microsite: probable cobertura interna suficiente, búsqueda externa desactivada o sin stock.";
  }

  if (latestMicrosite?.status !== "APPROVED") {
    return `Microsite creado pero no aprobado/enviado todavía (status=${latestMicrosite?.status ?? "desconocido"}).`;
  }

  const sendJob = relatedJobs.find((job) => job.type === "SEND_MICROSITE_TO_BUYER");
  if (!sendJob) return "Microsite aprobado, pero no se encontró job SEND_MICROSITE_TO_BUYER relacionado.";

  return "Flujo completo hasta microsite detectado; revisar envío/WhatsApp si el comprador no lo recibió.";
}

async function loadTargetDemandIds(opts: CliOptions): Promise<string[]> {
  if (opts.demandId) return [opts.demandId];

  const events = await prisma.event.findMany({
    where: {
      type: "DEMANDA_CREADA",
      createdAt: { gte: opts.since },
    },
    orderBy: { position: "desc" },
    take: opts.limit,
    select: { aggregateId: true },
  });

  return [...new Set(events.map((event) => event.aggregateId))];
}

async function auditUiVsDb(since: Date): Promise<AuditReport["crucesUiVsDb"]> {
  const [dbTotalMatchGenerado, dbMatchesSince, latest30, latest100, matchesSince] =
    await Promise.all([
      prisma.event.count({ where: { type: "MATCH_GENERADO" } }),
      prisma.event.count({ where: { type: "MATCH_GENERADO", createdAt: { gte: since } } }),
      prisma.event.findMany({
        where: { type: "MATCH_GENERADO" },
        orderBy: { position: "desc" },
        take: UI_DEFAULT_LIMIT,
        select: { createdAt: true, payload: true },
      }),
      prisma.event.findMany({
        where: { type: "MATCH_GENERADO" },
        orderBy: { position: "desc" },
        take: API_MAX_LIMIT,
        select: { id: true },
      }),
      prisma.event.findMany({
        where: { type: "MATCH_GENERADO", createdAt: { gte: since } },
        orderBy: { position: "desc" },
        take: 2_000,
        select: { payload: true },
      }),
    ]);

  const hasMoreThanThirty = dbTotalMatchGenerado > UI_DEFAULT_LIMIT;
  const conclusion = hasMoreThanThirty
    ? `La UI carga ${UI_DEFAULT_LIMIT} por página; hay ${dbTotalMatchGenerado} MATCH_GENERADO en BD.`
    : `La BD tiene ${dbTotalMatchGenerado} MATCH_GENERADO; el 30 no parece ser solo paginación.`;

  return {
    dbTotalMatchGenerado,
    dbMatchesSince,
    uiDefaultLimit: UI_DEFAULT_LIMIT,
    apiMaxLimit: API_MAX_LIMIT,
    firstPageVisibleCount: latest30.length,
    firstHundredVisibleCount: latest100.length,
    hasMoreThanThirty,
    latest30NewestAt: latest30[0]?.createdAt.toISOString() ?? null,
    latest30OldestAt: latest30.at(-1)?.createdAt.toISOString() ?? null,
    latestSourceBreakdownSince: sourceBreakdown(matchesSince),
    conclusion,
  };
}

async function auditCriticalJobs(since: Date): Promise<AuditReport["criticalJobs"]> {
  const jobs = await prisma.jobQueue.findMany({
    where: {
      type: { in: CRITICAL_JOB_TYPES },
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: 2_000,
    select: {
      id: true,
      type: true,
      status: true,
      attempts: true,
      maxAttempts: true,
      createdAt: true,
      availableAt: true,
      sourceEventId: true,
      idempotencyKey: true,
      lastError: true,
      payload: true,
    },
  });

  const oldestPending = await prisma.jobQueue.findFirst({
    where: {
      type: { in: CRITICAL_JOB_TYPES },
      status: { in: ["PENDING", "IN_PROGRESS"] },
    },
    orderBy: { availableAt: "asc" },
    select: {
      id: true,
      type: true,
      status: true,
      attempts: true,
      maxAttempts: true,
      createdAt: true,
      availableAt: true,
      sourceEventId: true,
      idempotencyKey: true,
      lastError: true,
      payload: true,
    },
  });

  const recentFailures = jobs
    .filter((job) => job.status === "FAILED" || job.status === "DEAD_LETTER")
    .slice(0, 20)
    .map(toJobLine);

  return {
    since: since.toISOString(),
    totalRecent: jobs.length,
    statusByType: countJobsByTypeAndStatus(jobs),
    oldestPending: oldestPending ? toJobLine(oldestPending) : null,
    recentFailures,
  };
}

async function auditConversationsUi(): Promise<AuditReport["conversationsUi"]> {
  const [byWaAndType, byWa] = await Promise.all([
    prisma.event.groupBy({
      by: ["aggregateId", "type"],
      where: {
        aggregateType: "WHATSAPP_CONVERSATION",
        type: { in: ["WHATSAPP_RECIBIDO", "WHATSAPP_ENVIADO"] },
      },
      _count: { _all: true },
    }),
    prisma.event.groupBy({
      by: ["aggregateId"],
      where: {
        aggregateType: "WHATSAPP_CONVERSATION",
        type: { in: ["WHATSAPP_RECIBIDO", "WHATSAPP_ENVIADO"] },
      },
      _count: { _all: true },
    }),
  ]);

  const perWa = new Map<string, { inbound: number; outbound: number; total: number }>();
  for (const row of byWa) {
    perWa.set(row.aggregateId, { inbound: 0, outbound: 0, total: row._count._all });
  }
  for (const row of byWaAndType) {
    const current = perWa.get(row.aggregateId) ?? { inbound: 0, outbound: 0, total: 0 };
    if (row.type === "WHATSAPP_RECIBIDO") current.inbound += row._count._all;
    if (row.type === "WHATSAPP_ENVIADO") current.outbound += row._count._all;
    perWa.set(row.aggregateId, current);
  }

  const rows = Array.from(perWa.values());
  const outboundMessages = rows.reduce((sum, row) => sum + row.outbound, 0);
  const inboundMessages = rows.reduce((sum, row) => sum + row.inbound, 0);

  return {
    defaultListLimit: UI_DEFAULT_LIMIT,
    maxListLimit: API_MAX_LIMIT,
    totalConversationWaIds: perWa.size,
    totalMessages: outboundMessages + inboundMessages,
    outboundMessages,
    inboundMessages,
    conversationsWithOutbound: rows.filter((row) => row.outbound > 0).length,
    conversationsWithInbound: rows.filter((row) => row.inbound > 0).length,
    visibleConversationCountAtDefaultLimit: Math.min(perWa.size, UI_DEFAULT_LIMIT),
    visibleConversationCountAtMaxLimit: Math.min(perWa.size, API_MAX_LIMIT),
    explanation:
      "La UI de conversaciones agrupa por waId y solo lee eventos WHATSAPP_* con aggregateType=WHATSAPP_CONVERSATION; 178 MATCH_GENERADO pueden corresponder a menos waIds o no haber enviado mensaje al comprador.",
  };
}

async function auditRecentRematchRuns(): Promise<AuditReport["recentRematchRuns"]> {
  const runs = await prisma.rematchRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 5,
    select: {
      id: true,
      status: true,
      totalDemands: true,
      totalBatches: true,
      demandsProcessed: true,
      matchesEmitted: true,
      matchesSkipped: true,
      startedAt: true,
      updatedAt: true,
      errorMessage: true,
    },
  });

  return runs.map((run) => ({
    id: run.id,
    status: run.status,
    totalDemands: run.totalDemands,
    totalBatches: run.totalBatches,
    demandsProcessed: run.demandsProcessed,
    matchesEmitted: run.matchesEmitted,
    matchesSkipped: run.matchesSkipped,
    startedAt: run.startedAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    errorMessage: run.errorMessage,
  }));
}

async function auditDemand(demandId: string, since: Date): Promise<DemandAudit> {
  const current = await prisma.demandCurrent.findUnique({
    where: { codigo: demandId },
    select: {
      codigo: true,
      nombre: true,
      estadoId: true,
      leadStatus: true,
      tipoOperacion: true,
      telefono: true,
      zonas: true,
      tipos: true,
      presupuestoMin: true,
      presupuestoMax: true,
      metrosMin: true,
      metrosMax: true,
      habitacionesMin: true,
      updatedAt: true,
    },
  });

  const demandEvents = await prisma.event.findMany({
    where: {
      aggregateId: demandId,
      type: { in: DEMAND_EVENT_TYPES },
      createdAt: { gte: since },
    },
    orderBy: { position: "asc" },
    select: {
      id: true,
      type: true,
      position: true,
      createdAt: true,
      causationId: true,
      correlationId: true,
      payload: true,
    },
  });

  const matchEvents = await prisma.event.findMany({
    where: {
      type: "MATCH_GENERADO",
      payload: { path: ["demandId"], equals: demandId },
      createdAt: { gte: since },
    },
    orderBy: { position: "desc" },
    take: 200,
    select: {
      id: true,
      type: true,
      position: true,
      createdAt: true,
      causationId: true,
      correlationId: true,
      payload: true,
    },
  });

  const selectionEvents = await prisma.event.findMany({
    where: {
      aggregateId: demandId,
      type: { in: ["SELECCION_VALIDADA", "SELECCION_COMPRADOR"] },
      createdAt: { gte: since },
    },
    orderBy: { position: "desc" },
    take: 50,
    select: {
      id: true,
      type: true,
      position: true,
      createdAt: true,
      causationId: true,
      correlationId: true,
      payload: true,
    },
  });

  const whatsappEvents = await prisma.event.findMany({
    where: {
      type: "WHATSAPP_ENVIADO",
      payload: { path: ["demandId"], equals: demandId },
      createdAt: { gte: since },
    },
    orderBy: { position: "desc" },
    take: 50,
    select: {
      id: true,
      type: true,
      position: true,
      createdAt: true,
      causationId: true,
      correlationId: true,
      payload: true,
    },
  });

  const buyerWaId = normalizeWhatsAppDigits(current?.telefono ?? "");
  const messageOr = [
    { payload: { path: ["demandId"], equals: demandId } },
    ...(buyerWaId.length >= 9 ? [{ aggregateId: buyerWaId }] : []),
  ];
  const whatsappMessageEvents = await prisma.event.findMany({
    where: {
      aggregateType: "WHATSAPP_CONVERSATION",
      type: { in: ["WHATSAPP_RECIBIDO", "WHATSAPP_ENVIADO"] },
      createdAt: { gte: since },
      OR: messageOr,
    },
    orderBy: { position: "desc" },
    take: 100,
    select: {
      id: true,
      type: true,
      aggregateId: true,
      payload: true,
      createdAt: true,
      occurredAt: true,
      causationId: true,
    },
  });

  const whatsappMessageLines = whatsappMessageEvents.map((event) => {
    const p = payloadRecord(event.payload);
    const byDemandId = p.demandId === demandId;
    const byPhone = buyerWaId.length >= 9 && event.aggregateId === buyerWaId;
    const matchReason =
      byDemandId && byPhone
        ? "both"
        : byDemandId
          ? "payload.demandId"
          : "aggregateId.phone";
    return toWhatsAppMessageLine(event, matchReason);
  });

  const eventIds = [
    ...demandEvents.map((event) => event.id),
    ...matchEvents.map((event) => event.id),
    ...selectionEvents.map((event) => event.id),
    ...whatsappEvents.map((event) => event.id),
    ...whatsappMessageEvents.map((event) => event.id),
  ];

  const jobOr = [
    { payload: { path: ["demandId"], equals: demandId } },
    ...eventIds.map((id) => ({ sourceEventId: id })),
    ...eventIds.map((id) => ({
      AND: [
        { type: "PROCESS_EVENT" as JobType },
        { payload: { path: ["eventId"], equals: id } },
      ],
    })),
  ];

  const relatedJobs = await prisma.jobQueue.findMany({
    where: {
      OR: jobOr,
      type: { in: CRITICAL_JOB_TYPES },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      type: true,
      status: true,
      attempts: true,
      maxAttempts: true,
      createdAt: true,
      availableAt: true,
      sourceEventId: true,
      idempotencyKey: true,
      lastError: true,
      payload: true,
    },
  });

  const microsites = await prisma.micrositeSelection.findMany({
    where: { demandId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      token: true,
      status: true,
      source: true,
      sourceEventId: true,
      stockCount: true,
      properties: true,
      buyerPhone: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const cooldownCutoff = new Date(Date.now() - COVERAGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  const recentCoverageDedup = await prisma.micrositeSelection.findFirst({
    where: {
      demandId,
      source: "coverage_scan",
      OR: [
        { status: "PENDING_VALIDATION" },
        { status: "APPROVED", createdAt: { gte: cooldownCutoff } },
      ],
    },
    select: { id: true },
  });

  const blockers: string[] = [];
  const warnings: string[] = [];
  const activeState = current ? ACTIVE_DEMAND_STATES.includes(current.estadoId) : false;
  const hasTipoOperacion = Boolean(current?.tipoOperacion?.trim());
  const hasBuyerPhone = Boolean(current?.telefono?.trim());
  const zonasPresent = Boolean(current?.zonas?.trim());
  const tiposPresent = Boolean(current?.tipos?.trim());
  const presupuestoPresent = Boolean(
    (current?.presupuestoMin ?? 0) > 0 || (current?.presupuestoMax ?? 0) > 0,
  );
  const metrosPresent = current?.metrosMin != null || current?.metrosMax != null;
  const habitacionesPresent = (current?.habitacionesMin ?? 0) > 0;
  const hasSearchCriteria =
    zonasPresent || tiposPresent || presupuestoPresent || metrosPresent || habitacionesPresent;

  if (!current) {
    blockers.push("DemandCurrent no encontrado");
  } else {
    if (!activeState) blockers.push(`estadoId no activo (${current.estadoId})`);
    if (!hasTipoOperacion) blockers.push("tipoOperacion vacío");
    if (!hasSearchCriteria) warnings.push("criterios de búsqueda muy incompletos");
    if (!hasBuyerPhone) warnings.push("sin teléfono: puede generar cruces, pero no enviar al comprador");
  }

  const micrositeLines: MicrositeLine[] = microsites.map((selection) => ({
    id: selection.id,
    token: selection.token,
    status: selection.status,
    source: selection.source,
    sourceEventId: selection.sourceEventId,
    stockCount: selection.stockCount,
    propertiesCount: Array.isArray(selection.properties) ? selection.properties.length : 0,
    buyerPhonePresent: selection.buyerPhone.trim().length > 0,
    createdAt: selection.createdAt.toISOString(),
    updatedAt: selection.updatedAt.toISOString(),
  }));

  const jobLines = relatedJobs.map(toJobLine);
  const latestMicrosite = micrositeLines[0] ?? null;

  return {
    demandId,
    current: {
      found: Boolean(current),
      nombre: current?.nombre ?? null,
      estadoId: current?.estadoId ?? null,
      leadStatus: current?.leadStatus ?? null,
      tipoOperacion: current?.tipoOperacion ?? null,
      telefonoPresent: hasBuyerPhone,
      zonasPresent,
      tiposPresent,
      presupuestoPresent,
      metrosPresent,
      habitacionesPresent,
      updatedAt: current?.updatedAt.toISOString() ?? null,
    },
    eligibility: {
      activeState,
      hasTipoOperacion,
      hasBuyerPhone,
      hasSearchCriteria,
      blockers,
      warnings,
    },
    events: {
      demandEvents: demandEvents.map(toEventLine),
      matchEventsCount: matchEvents.length,
      matchSourceBreakdown: sourceBreakdown(matchEvents),
      latestMatchEvents: matchEvents.slice(0, 20).map(toMatchLine),
      selectionEvents: selectionEvents.map(toEventLine),
      whatsappEvents: whatsappEvents.map(toEventLine),
    },
    jobs: {
      relatedCount: jobLines.length,
      statusBreakdown: countByStatus(jobLines),
      latest: jobLines,
    },
    microsites: {
      count: micrositeLines.length,
      recentCoverageDedup: Boolean(recentCoverageDedup),
      latest: micrositeLines,
    },
    whatsappMessages: {
      buyerWaId: buyerWaId || null,
      outboundCount: whatsappMessageLines.filter((message) => message.direction === "outbound").length,
      inboundCount: whatsappMessageLines.filter((message) => message.direction === "inbound").length,
      matchedByDemandIdCount: whatsappMessageLines.filter(
        (message) => message.matchReason === "payload.demandId" || message.matchReason === "both",
      ).length,
      matchedByPhoneCount: whatsappMessageLines.filter(
        (message) => message.matchReason === "aggregateId.phone" || message.matchReason === "both",
      ).length,
      latest: whatsappMessageLines,
    },
    likelyCut: inferDemandCut({
      currentFound: Boolean(current),
      blockers,
      demandEventsCount: demandEvents.length,
      relatedJobs: jobLines,
      matchEventsCount: matchEvents.length,
      micrositeCount: micrositeLines.length,
      latestMicrosite,
      recentCoverageDedup: Boolean(recentCoverageDedup),
    }),
  };
}

function inferOverallFindings(report: Omit<AuditReport, "overallFindings">): string[] {
  const findings: string[] = [];

  findings.push(report.crucesUiVsDb.conclusion);
  findings.push(
    `Conversaciones UI: ${report.conversationsUi.totalConversationWaIds} waIds con mensajes WhatsApp; no equivalen a ${report.crucesUiVsDb.dbTotalMatchGenerado} cruces porque la UI agrupa por teléfono y solo muestra WHATSAPP_CONVERSATION.`,
  );

  if (report.criticalJobs.oldestPending) {
    findings.push(
      `Hay jobs críticos pendientes/en progreso; el más antiguo es ${report.criticalJobs.oldestPending.type} (${report.criticalJobs.oldestPending.status}) desde ${report.criticalJobs.oldestPending.availableAt}.`,
    );
  }

  if (report.criticalJobs.recentFailures.length > 0) {
    findings.push(
      `Hay ${report.criticalJobs.recentFailures.length} fallos recientes en jobs críticos dentro de la ventana.`,
    );
  }

  if (!report.environment.externalPortfolioSearchEnabled) {
    findings.push("ENABLE_EXTERNAL_PORTFOLIO_SEARCH no está activo; coverage no generará microsites externos.");
  }

  if (!report.environment.statefoxTokenConfigured) {
    findings.push("STATEFOX_BEARER_TOKEN no está configurado; Statefox puede fallar si se usa como proveedor.");
  }

  if (!report.environment.openAiKeyConfigured) {
    findings.push("OPENAI_API_KEY no está configurado; la aprobación IA de microsites fallará.");
  }

  for (const demand of report.demands) {
    findings.push(`${demand.demandId}: ${demand.likelyCut}`);
  }

  return findings;
}

async function buildReport(opts: CliOptions): Promise<AuditReport> {
  const [crucesUiVsDb, criticalJobs, recentRematchRuns, conversationsUi, demandIds] = await Promise.all([
    auditUiVsDb(opts.since),
    auditCriticalJobs(opts.since),
    auditRecentRematchRuns(),
    auditConversationsUi(),
    loadTargetDemandIds(opts),
  ]);

  const demands: DemandAudit[] = [];
  for (const demandId of demandIds) {
    demands.push(await auditDemand(demandId, opts.since));
  }

  const base = {
    generatedAt: new Date().toISOString(),
    filters: {
      demandId: opts.demandId,
      since: opts.since.toISOString(),
      days: opts.days,
      demandLimit: opts.limit,
    },
    environment: {
      databaseUrlConfigured: Boolean(process.env.DATABASE_URL?.trim()),
      externalPortfolioSearchEnabled: isExternalPortfolioSearchEnabled(),
      statefoxTokenConfigured: Boolean(process.env.STATEFOX_BEARER_TOKEN?.trim()),
      openAiKeyConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
      nextPublicAppUrlConfigured: Boolean(process.env.NEXT_PUBLIC_APP_URL?.trim()),
      coverageCooldownDays: COVERAGE_COOLDOWN_DAYS,
    },
    crucesUiVsDb,
    criticalJobs,
    recentRematchRuns,
    conversationsUi,
    demands,
  };

  return {
    ...base,
    overallFindings: inferOverallFindings(base),
  };
}

function printTextReport(report: AuditReport): void {
  console.log("=== Auditoría de Cruces y Microsites ===");
  console.log(`Generado: ${report.generatedAt}`);
  console.log(
    `Filtros: demandId=${report.filters.demandId ?? "(recientes)"} since=${report.filters.since} limit=${report.filters.demandLimit}`,
  );

  console.log("\n== 30 visible vs BD ==");
  console.log(`MATCH_GENERADO total en BD: ${report.crucesUiVsDb.dbTotalMatchGenerado}`);
  console.log(`MATCH_GENERADO desde filtro: ${report.crucesUiVsDb.dbMatchesSince}`);
  console.log(`Primera página UI (${UI_DEFAULT_LIMIT}): ${report.crucesUiVsDb.firstPageVisibleCount}`);
  console.log(`Consulta ampliada (${API_MAX_LIMIT}): ${report.crucesUiVsDb.firstHundredVisibleCount}`);
  console.log(`Conclusión: ${report.crucesUiVsDb.conclusion}`);
  console.log(
    `Sources desde filtro: ${JSON.stringify(report.crucesUiVsDb.latestSourceBreakdownSince)}`,
  );

  console.log("\n== Conversaciones UI ==");
  console.log(`waIds con conversación WhatsApp: ${report.conversationsUi.totalConversationWaIds}`);
  console.log(`Mensajes outbound: ${report.conversationsUi.outboundMessages}`);
  console.log(`Mensajes inbound: ${report.conversationsUi.inboundMessages}`);
  console.log(
    `Visible en UI por defecto (${report.conversationsUi.defaultListLimit}): ${report.conversationsUi.visibleConversationCountAtDefaultLimit}`,
  );
  console.log(
    `Visible con limit=${report.conversationsUi.maxListLimit}: ${report.conversationsUi.visibleConversationCountAtMaxLimit}`,
  );
  console.log(`Nota: ${report.conversationsUi.explanation}`);

  console.log("\n== Entorno ==");
  console.log(`DATABASE_URL configurado: ${report.environment.databaseUrlConfigured ? "sí" : "no"}`);
  console.log(
    `ENABLE_EXTERNAL_PORTFOLIO_SEARCH activo: ${report.environment.externalPortfolioSearchEnabled ? "sí" : "no"}`,
  );
  console.log(`STATEFOX_BEARER_TOKEN configurado: ${report.environment.statefoxTokenConfigured ? "sí" : "no"}`);
  console.log(`OPENAI_API_KEY configurado: ${report.environment.openAiKeyConfigured ? "sí" : "no"}`);
  console.log(`NEXT_PUBLIC_APP_URL configurado: ${report.environment.nextPublicAppUrlConfigured ? "sí" : "no"}`);

  console.log("\n== Jobs críticos ==");
  console.log(`Jobs recientes: ${report.criticalJobs.totalRecent}`);
  console.log(JSON.stringify(report.criticalJobs.statusByType, null, 2));
  if (report.criticalJobs.oldestPending) {
    const job = report.criticalJobs.oldestPending;
    console.log(
      `Más antiguo pendiente: ${job.type} ${job.status} availableAt=${job.availableAt} attempts=${job.attempts}/${job.maxAttempts}`,
    );
  }
  if (report.criticalJobs.recentFailures.length > 0) {
    console.log("Fallos recientes:");
    for (const job of report.criticalJobs.recentFailures.slice(0, 10)) {
      console.log(`- ${job.type} ${job.status} id=${job.id} err=${job.lastError ?? "-"}`);
    }
  }

  console.log("\n== Rematch manual reciente ==");
  if (report.recentRematchRuns.length === 0) {
    console.log("Sin RematchRun recientes.");
  } else {
    for (const run of report.recentRematchRuns) {
      console.log(
        `- ${run.id} ${run.status} demands=${run.demandsProcessed}/${run.totalDemands} emitted=${run.matchesEmitted} skipped=${run.matchesSkipped} updated=${run.updatedAt}`,
      );
    }
  }

  console.log("\n== Demandas auditadas ==");
  if (report.demands.length === 0) {
    console.log("No se encontraron DEMANDA_CREADA recientes con los filtros actuales.");
  }
  for (const demand of report.demands) {
    console.log(`\nDemanda ${demand.demandId} — ${demand.current.nombre ?? "(sin nombre)"}`);
    console.log(
      `  estadoId=${demand.current.estadoId ?? "-"} active=${demand.eligibility.activeState ? "sí" : "no"} tipoOperacion=${demand.current.tipoOperacion ?? "-"} telefono=${demand.current.telefonoPresent ? "sí" : "no"}`,
    );
    if (demand.eligibility.blockers.length > 0) {
      console.log(`  blockers: ${demand.eligibility.blockers.join("; ")}`);
    }
    if (demand.eligibility.warnings.length > 0) {
      console.log(`  warnings: ${demand.eligibility.warnings.join("; ")}`);
    }
    console.log(
      `  eventos demanda=${demand.events.demandEvents.length} matches=${demand.events.matchEventsCount} microsites=${demand.microsites.count} jobs=${demand.jobs.relatedCount}`,
    );
    console.log(
      `  mensajes WA waId=${demand.whatsappMessages.buyerWaId ?? "-"} outbound=${demand.whatsappMessages.outboundCount} inbound=${demand.whatsappMessages.inboundCount} byDemandId=${demand.whatsappMessages.matchedByDemandIdCount} byPhone=${demand.whatsappMessages.matchedByPhoneCount}`,
    );
    console.log(`  match sources: ${JSON.stringify(demand.events.matchSourceBreakdown)}`);
    console.log(`  corte probable: ${demand.likelyCut}`);
    for (const message of demand.whatsappMessages.latest.slice(0, 8)) {
      console.log(
        `    wa ${message.direction} ${message.createdAt} waId=${message.waId} kind=${message.kind ?? "-"} source=${message.source ?? "-"} reason=${message.matchReason} preview=${JSON.stringify(message.preview)}`,
      );
    }
    for (const job of demand.jobs.latest.slice(0, 8)) {
      console.log(
        `    job ${job.type} ${job.status} attempts=${job.attempts}/${job.maxAttempts} created=${job.createdAt}${job.lastError ? ` err=${job.lastError}` : ""}`,
      );
    }
    for (const selection of demand.microsites.latest.slice(0, 5)) {
      console.log(
        `    microsite ${selection.status} source=${selection.source ?? "-"} stock=${selection.stockCount} props=${selection.propertiesCount} created=${selection.createdAt}`,
      );
    }
  }

  console.log("\n== Hallazgos ==");
  for (const finding of report.overallFindings) {
    console.log(`- ${finding}`);
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const report = await buildReport(opts);

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printTextReport(report);
  }
}

main()
  .catch((err) => {
    console.error("Fallo ejecutando auditoría de cruces/microsites:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
