import { prisma } from "@/lib/prisma";
import { normalizeWhatsAppDigits } from "@/lib/microsite/buyer-phone";
import { coerceMicrositeCuratedProperties } from "@/lib/microsite/selection";
import { normalizeConversationEvent, previewText } from "./normalize";
import type {
  ConversationContext,
  ConversationDetailResult,
  ConversationListResult,
  ConversationMessage,
  ConversationSelectionContext,
  ConversationSentProperty,
  ConversationSummary,
} from "./types";

const CONVERSATION_AGGREGATE_TYPES = ["WHATSAPP_CONVERSATION", "MENTAL_CONVERSATION"] as const;
const INBOUND_MESSAGE_TYPES = ["WHATSAPP_RECIBIDO", "MENTAL_MSG_RECIBIDO"] as const;
const OUTBOUND_MESSAGE_TYPES = ["WHATSAPP_ENVIADO", "MENTAL_MSG_ENVIADO"] as const;
const MESSAGE_TYPES = [...INBOUND_MESSAGE_TYPES, ...OUTBOUND_MESSAGE_TYPES] as const;
const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 100;
const DEFAULT_DETAIL_LIMIT = 100;
const MAX_DETAIL_LIMIT = 500;

type DirectionFilter = "all" | "inbound" | "outbound";

type DemandInfo = {
  codigo: string;
  nombre: string;
  telefono: string;
  agente: string;
};

type ConversationRelation = {
  ownerName: string | null;
  relationLabel: string;
  demandId: string | null;
  demandName: string | null;
  demandPhone: string | null;
  demandAgent: string | null;
  selectionId: string | null;
  selectionName: string | null;
  propertyCode: string | null;
  commercialName: string | null;
};

export interface ListConversationsOptions {
  limit?: number;
  cursor?: string | null;
  search?: string | null;
  from?: Date | null;
  to?: Date | null;
  direction?: DirectionFilter;
  agentOnly?: boolean;
}

export interface GetConversationOptions {
  limit?: number;
  offset?: number;
  direction?: DirectionFilter;
}

function clamp(value: number | undefined, fallback: number, max: number): number {
  if (!value || Number.isNaN(value) || value < 1) return fallback;
  return Math.min(value, max);
}

function messageTypeFilter(direction: DirectionFilter | undefined) {
  if (direction === "inbound") return INBOUND_MESSAGE_TYPES;
  if (direction === "outbound") return OUTBOUND_MESSAGE_TYPES;
  return MESSAGE_TYPES;
}

function includesSearch(summary: ConversationSummary, search: string | null | undefined): boolean {
  const normalized = search?.trim().toLowerCase();
  if (!normalized) return true;
  return [
    summary.waId,
    summary.displayName,
    summary.ownerName,
    summary.relationLabel,
    summary.demandId,
    summary.demandName,
    summary.demandPhone,
    summary.demandAgent,
    summary.selectionId,
    summary.selectionName,
    summary.propertyCode,
    summary.commercialName,
    summary.lastMessagePreview,
  ]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(normalized));
}

function sourceLooksAgent(message: ConversationMessage): boolean {
  const source = message.source?.toLowerCase() ?? "";
  return (
    source.includes("agent") ||
    source.includes("nlu") ||
    source.includes("conversational") ||
    source.includes("coach")
  );
}

function lastNine(value: string): string {
  return normalizeWhatsAppDigits(value).slice(-9);
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function mapDemandRows(rows: DemandInfo[]): Map<string, DemandInfo> {
  return new Map(rows.map((row) => [row.codigo, row]));
}

function toSentProperty(property: ReturnType<typeof coerceMicrositeCuratedProperties>[number]): ConversationSentProperty {
  const firstImage =
    property.images.length > 0 && typeof property.images[0] === "string" && property.images[0].trim()
      ? property.images[0].trim()
      : null;
  return {
    propertyId: property.propertyId,
    title: property.title,
    firstImageUrl: firstImage,
    price: property.price,
    metersBuilt: property.metersBuilt,
    rooms: property.rooms,
    city: property.city,
    zone: property.zone,
    link: property.link,
    extras: property.extras.slice(0, 5),
  };
}

async function loadConversationContext(waId: string): Promise<ConversationContext> {
  const suffix = lastNine(waId);
  const [session, demandByPhone] = await Promise.all([
    prisma.whatsAppBuyerSession.findUnique({
      where: { waId },
      select: { demandId: true, selectionId: true },
    }),
    suffix.length >= 9
      ? prisma.demandCurrent.findFirst({
          where: { telefono: { endsWith: suffix } },
          select: {
            codigo: true,
            nombre: true,
            telefono: true,
            agente: true,
            leadStatus: true,
            presupuestoMin: true,
            presupuestoMax: true,
            zonas: true,
            tipos: true,
          },
        })
      : Promise.resolve(null),
  ]);

  const demandId = session?.demandId ?? demandByPhone?.codigo ?? null;
  const demand = demandId
    ? await prisma.demandCurrent.findUnique({
        where: { codigo: demandId },
        select: {
          codigo: true,
          nombre: true,
          telefono: true,
          agente: true,
          leadStatus: true,
          presupuestoMin: true,
          presupuestoMax: true,
          zonas: true,
          tipos: true,
        },
      })
    : demandByPhone;

  const selectionWhere = {
    OR: [
      ...(session?.selectionId ? [{ id: session.selectionId }] : []),
      ...(demandId ? [{ demandId }] : []),
      ...(suffix.length >= 9 ? [{ buyerPhone: { endsWith: suffix } }] : []),
    ],
  };

  const selections = selectionWhere.OR.length > 0
    ? await prisma.micrositeSelection.findMany({
        where: selectionWhere,
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          token: true,
          status: true,
          demandId: true,
          demandNombre: true,
          buyerPhone: true,
          createdAt: true,
          validatedAt: true,
          firstViewedAt: true,
          stockCount: true,
          properties: true,
        },
      })
    : [];

  const mappedSelections: ConversationSelectionContext[] = selections.map((selection) => ({
    id: selection.id,
    token: selection.token,
    status: selection.status,
    demandId: selection.demandId,
    demandName: nonEmpty(selection.demandNombre),
    buyerPhone: nonEmpty(selection.buyerPhone),
    createdAt: selection.createdAt.toISOString(),
    validatedAt: selection.validatedAt?.toISOString() ?? null,
    firstViewedAt: selection.firstViewedAt?.toISOString() ?? null,
    stockCount: selection.stockCount,
    properties: coerceMicrositeCuratedProperties(selection.properties).map(toSentProperty),
  }));

  return {
    demand: demand
      ? {
          id: demand.codigo,
          name: demand.nombre,
          phone: nonEmpty(demand.telefono),
          agent: nonEmpty(demand.agente),
          leadStatus: String(demand.leadStatus),
          budgetMin: demand.presupuestoMin,
          budgetMax: demand.presupuestoMax,
          zones: nonEmpty(demand.zonas),
          types: nonEmpty(demand.tipos),
        }
      : null,
    selections: mappedSelections,
  };
}

async function loadRelations(params: {
  waIds: string[];
  sessionByWaId: Map<string, {
    waId: string;
    demandId: string;
    selectionId: string | null;
    conversationPhase: string | null;
    lastMessageAt: Date | null;
  }>;
}): Promise<Map<string, ConversationRelation>> {
  const { waIds, sessionByWaId } = params;
  if (waIds.length === 0) return new Map();

  const demandIds = new Set<string>();
  const selectionIds = new Set<string>();
  for (const session of sessionByWaId.values()) {
    if (session.demandId) demandIds.add(session.demandId);
    if (session.selectionId) selectionIds.add(session.selectionId);
  }

  const phoneSuffixes = Array.from(new Set(waIds.map(lastNine).filter((value) => value.length >= 9)));
  const phoneOr = phoneSuffixes.map((suffix) => ({ telefono: { endsWith: suffix } }));
  const waOr = waIds.map((waId) => ({ waId }));
  const phoneWaOr = waIds.map((waId) => ({ telefono: { endsWith: lastNine(waId) } }));

  const [
    demandCurrentRows,
    demandSnapshotRows,
    selectionsById,
    selectionsByPhone,
    visitSessions,
    comercialesByWa,
    comercialesByPhone,
    mentalSessions,
    postventaSessions,
    parteVisitaSessions,
  ] = await Promise.all([
    prisma.demandCurrent.findMany({
      where: {
        OR: [
          ...(demandIds.size > 0 ? [{ codigo: { in: Array.from(demandIds) } }] : []),
          ...phoneOr,
        ],
      },
      select: { codigo: true, nombre: true, telefono: true, agente: true },
    }),
    prisma.demandSnapshot.findMany({
      where: {
        OR: [
          ...(demandIds.size > 0 ? [{ codigo: { in: Array.from(demandIds) } }] : []),
          ...phoneOr,
        ],
      },
      select: { codigo: true, nombre: true, telefono: true, agente: true },
    }),
    prisma.micrositeSelection.findMany({
      where: selectionIds.size > 0 ? { id: { in: Array.from(selectionIds) } } : { id: "__none__" },
      select: { id: true, demandId: true, demandNombre: true, buyerPhone: true },
    }),
    prisma.micrositeSelection.findMany({
      where: phoneSuffixes.length > 0
        ? { OR: phoneSuffixes.map((suffix) => ({ buyerPhone: { endsWith: suffix } })) }
        : { id: "__none__" },
      orderBy: { createdAt: "desc" },
      take: waIds.length * 3,
      select: { id: true, demandId: true, demandNombre: true, buyerPhone: true },
    }),
    prisma.visitSchedulingSession.findMany({
      where: {
        OR: [
          ...waIds.map((waId) => ({ buyerWaId: waId })),
          ...waIds.map((waId) => ({ comercialWaId: waId })),
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: waIds.length * 3,
      select: {
        demandId: true,
        propertyCode: true,
        buyerWaId: true,
        comercialWaId: true,
        comercialId: true,
      },
    }),
    prisma.comercial.findMany({
      where: waOr.length > 0 ? { OR: waOr } : { id: "__none__" },
      select: { id: true, nombre: true, telefono: true, waId: true },
    }),
    prisma.comercial.findMany({
      where: phoneWaOr.length > 0 ? { OR: phoneWaOr } : { id: "__none__" },
      select: { id: true, nombre: true, telefono: true, waId: true },
    }),
    prisma.mentalHealthSession.findMany({
      where: { waId: { in: waIds } },
      select: { waId: true, comercialId: true },
    }),
    prisma.postventaSurveySession.findMany({
      where: phoneSuffixes.length > 0
        ? { OR: phoneSuffixes.map((suffix) => ({ buyerPhone: { endsWith: suffix } })) }
        : { id: "__none__" },
      orderBy: { updatedAt: "desc" },
      take: waIds.length * 2,
      select: { buyerPhone: true, buyerName: true, operacionId: true, propertyCode: true },
    }),
    prisma.parteVisitaSession.findMany({
      where: phoneSuffixes.length > 0
        ? { OR: phoneSuffixes.map((suffix) => ({ buyerPhone: { endsWith: suffix } })) }
        : { id: "__none__" },
      orderBy: { updatedAt: "desc" },
      take: waIds.length * 2,
      select: { buyerPhone: true, buyerNombre: true, propertyCode: true, propertyRef: true },
    }),
  ]);

  const demandById = mapDemandRows([...demandSnapshotRows, ...demandCurrentRows]);
  const demandByPhoneSuffix = new Map<string, DemandInfo>();
  for (const demand of [...demandSnapshotRows, ...demandCurrentRows]) {
    const suffix = lastNine(demand.telefono);
    if (suffix.length >= 9 && !demandByPhoneSuffix.has(suffix)) {
      demandByPhoneSuffix.set(suffix, demand);
    }
  }

  const selectionById = new Map(selectionsById.map((selection) => [selection.id, selection]));
  const selectionByPhoneSuffix = new Map<string, (typeof selectionsByPhone)[number]>();
  for (const selection of selectionsByPhone) {
    const suffix = lastNine(selection.buyerPhone);
    if (suffix.length >= 9 && !selectionByPhoneSuffix.has(suffix)) {
      selectionByPhoneSuffix.set(suffix, selection);
      if (selection.demandId) demandIds.add(selection.demandId);
    }
  }

  const commercialByWaId = new Map<string, (typeof comercialesByWa)[number]>();
  for (const comercial of [...comercialesByWa, ...comercialesByPhone]) {
    if (comercial.waId) commercialByWaId.set(comercial.waId, comercial);
    const suffix = lastNine(comercial.telefono);
    if (suffix.length >= 9) commercialByWaId.set(suffix, comercial);
  }
  const commercialById = new Map(
    [...comercialesByWa, ...comercialesByPhone].map((comercial) => [comercial.id, comercial]),
  );
  const mentalSessionByWaId = new Map(mentalSessions.map((session) => [session.waId, session]));

  const relationByWaId = new Map<string, ConversationRelation>();
  for (const waId of waIds) {
    const suffix = lastNine(waId);
    const session = sessionByWaId.get(waId);
    const selection = (session?.selectionId ? selectionById.get(session.selectionId) : null)
      ?? selectionByPhoneSuffix.get(suffix)
      ?? null;
    const visit = visitSessions.find((item) => item.buyerWaId === waId || item.comercialWaId === waId) ?? null;
    const mentalSession = mentalSessionByWaId.get(waId) ?? null;
    const mentalCommercial = mentalSession?.comercialId
      ? commercialById.get(mentalSession.comercialId) ?? null
      : null;
    const commercial = mentalCommercial ?? commercialByWaId.get(waId) ?? commercialByWaId.get(suffix) ?? null;
    const postventa = postventaSessions.find((item) => lastNine(item.buyerPhone) === suffix) ?? null;
    const parteVisita = parteVisitaSessions.find((item) => lastNine(item.buyerPhone) === suffix) ?? null;

    const demandId = session?.demandId ?? selection?.demandId ?? visit?.demandId ?? null;
    const demand = demandId ? demandById.get(demandId) : demandByPhoneSuffix.get(suffix);
    const relationLabel = mentalSession
      ? "Coach emocional"
      : commercial
      ? "Comercial interno"
      : visit?.comercialWaId === waId
        ? "Comercial en visita"
        : visit?.buyerWaId === waId
          ? "Comprador en visita"
          : demand
            ? "Demanda"
            : selection
              ? "Comprador de microsite"
              : postventa
                ? "Cliente post-venta"
                : parteVisita
                  ? "Comprador en parte de visita"
                  : "Sin relacion identificada";

    const demandName = nonEmpty(demand?.nombre) ?? nonEmpty(selection?.demandNombre) ?? null;
    const ownerName =
      nonEmpty(demandName)
      ?? nonEmpty(postventa?.buyerName)
      ?? nonEmpty(parteVisita?.buyerNombre)
      ?? nonEmpty(commercial?.nombre)
      ?? null;

    relationByWaId.set(waId, {
      ownerName,
      relationLabel,
      demandId: demand?.codigo ?? demandId,
      demandName,
      demandPhone: nonEmpty(demand?.telefono) ?? nonEmpty(selection?.buyerPhone) ?? null,
      demandAgent: nonEmpty(demand?.agente),
      selectionId: session?.selectionId ?? selection?.id ?? null,
      selectionName: nonEmpty(selection?.demandNombre),
      propertyCode: visit?.propertyCode ?? postventa?.propertyCode ?? parteVisita?.propertyCode ?? null,
      commercialName: nonEmpty(commercial?.nombre),
    });
  }

  return relationByWaId;
}

export async function listConversations(
  options: ListConversationsOptions = {},
): Promise<ConversationListResult> {
  const limit = clamp(options.limit, DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
  const take = Math.max(limit * 30, 300);
  const typeFilter = messageTypeFilter(options.direction);

  const events = await prisma.event.findMany({
    where: {
      aggregateType: { in: [...CONVERSATION_AGGREGATE_TYPES] },
      type: { in: [...typeFilter] },
      ...(options.cursor ? { occurredAt: { lt: new Date(options.cursor) } } : {}),
      ...(options.from || options.to
        ? {
            occurredAt: {
              ...(options.from ? { gte: options.from } : {}),
              ...(options.to ? { lte: options.to } : {}),
              ...(options.cursor ? { lt: new Date(options.cursor) } : {}),
            },
          }
        : {}),
    },
    orderBy: { occurredAt: "desc" },
    take,
    select: {
      id: true,
      position: true,
      type: true,
      aggregateType: true,
      aggregateId: true,
      payload: true,
      metadata: true,
      correlationId: true,
      causationId: true,
      occurredAt: true,
      createdAt: true,
    },
  });

  const grouped = new Map<string, ConversationMessage[]>();
  for (const event of events) {
    const message = normalizeConversationEvent(event);
    if (!message) continue;
    const messages = grouped.get(message.waId) ?? [];
    messages.push(message);
    grouped.set(message.waId, messages);
  }

  const waIds = Array.from(grouped.keys());
  const sessions = await prisma.whatsAppBuyerSession.findMany({
    where: { waId: { in: waIds } },
    select: {
      waId: true,
      demandId: true,
      selectionId: true,
      conversationPhase: true,
      lastMessageAt: true,
    },
  });
  const sessionByWaId = new Map(sessions.map((session) => [session.waId, session]));
  const relationByWaId = await loadRelations({ waIds, sessionByWaId });

  const counts = await prisma.event.groupBy({
    by: ["aggregateId", "type"],
    where: {
      aggregateType: { in: [...CONVERSATION_AGGREGATE_TYPES] },
      aggregateId: { in: waIds },
      type: { in: [...MESSAGE_TYPES] },
    },
    _count: { _all: true },
  });
  const countByWaId = new Map<string, { inbound: number; outbound: number }>();
  for (const row of counts) {
    const current = countByWaId.get(row.aggregateId) ?? { inbound: 0, outbound: 0 };
    if ((INBOUND_MESSAGE_TYPES as readonly string[]).includes(row.type)) {
      current.inbound += row._count._all;
    }
    if ((OUTBOUND_MESSAGE_TYPES as readonly string[]).includes(row.type)) {
      current.outbound += row._count._all;
    }
    countByWaId.set(row.aggregateId, current);
  }

  const summaries = Array.from(grouped.entries())
    .map(([waId, messages]) => {
      const sorted = messages.sort((a, b) => Number(BigInt(b.position) - BigInt(a.position)));
      const latest = sorted[0];
      const session = sessionByWaId.get(waId);
      const relation = relationByWaId.get(waId);
      const countsForWaId = countByWaId.get(waId) ?? { inbound: 0, outbound: 0 };
      const displayName = messages
        .map((message) => {
          const payload = message.rawPayload as Record<string, unknown>;
          return typeof payload.profileName === "string" ? payload.profileName : null;
        })
        .find((name): name is string => Boolean(name)) ?? null;

      return {
        waId,
        displayName,
        ownerName: relation?.ownerName ?? displayName,
        relationLabel: relation?.relationLabel ?? "Sin relacion identificada",
        demandId: relation?.demandId ?? session?.demandId ?? null,
        demandName: relation?.demandName ?? null,
        demandPhone: relation?.demandPhone ?? null,
        demandAgent: relation?.demandAgent ?? null,
        selectionId: relation?.selectionId ?? session?.selectionId ?? null,
        selectionName: relation?.selectionName ?? null,
        propertyCode: relation?.propertyCode ?? null,
        commercialName: relation?.commercialName ?? null,
        conversationPhase: session?.conversationPhase ?? null,
        lastMessageAt: latest.occurredAt,
        lastMessagePreview: previewText(latest.text),
        lastDirection: latest.direction,
        messageCount: countsForWaId.inbound + countsForWaId.outbound,
        inboundCount: countsForWaId.inbound,
        outboundCount: countsForWaId.outbound,
        hasAgentMessages: messages.some(sourceLooksAgent),
      } satisfies ConversationSummary;
    })
    .filter((summary) => includesSearch(summary, options.search))
    .filter((summary) => !options.agentOnly || summary.hasAgentMessages)
    .sort((a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt));

  const conversations = summaries.slice(0, limit);
  const nextCursor =
    summaries.length > limit ? conversations[conversations.length - 1]?.lastMessageAt ?? null : null;

  return { conversations, nextCursor };
}

export async function getConversation(
  waId: string,
  options: GetConversationOptions = {},
): Promise<ConversationDetailResult> {
  const limit = clamp(options.limit, DEFAULT_DETAIL_LIMIT, MAX_DETAIL_LIMIT);
  const offset = Math.max(options.offset ?? 0, 0);
  const typeFilter = messageTypeFilter(options.direction);

  const events = await prisma.event.findMany({
    where: {
      aggregateType: { in: [...CONVERSATION_AGGREGATE_TYPES] },
      aggregateId: waId,
      type: { in: [...typeFilter] },
    },
    orderBy: { position: "asc" },
    skip: offset,
    take: limit + 1,
    select: {
      id: true,
      position: true,
      type: true,
      aggregateType: true,
      aggregateId: true,
      payload: true,
      metadata: true,
      correlationId: true,
      causationId: true,
      occurredAt: true,
      createdAt: true,
    },
  });

  const normalized = events
    .slice(0, limit)
    .map((event) => normalizeConversationEvent(event))
    .filter((message): message is ConversationMessage => Boolean(message));
  const context = await loadConversationContext(waId);

  return {
    waId,
    messages: normalized,
    context,
    nextOffset: events.length > limit ? offset + limit : null,
  };
}

