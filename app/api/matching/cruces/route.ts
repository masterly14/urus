import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { getPublicAppUrl } from "@/lib/microsite/app-url";
import { coerceMicrositeCuratedProperties } from "@/lib/microsite/selection";

interface MatchEventPayload {
  demandId?: string;
  demandRef?: string;
  demandNombre?: string;
  propertyId?: string;
  propertyRef?: string;
  totalScore?: number;
  matchScore?: Record<string, unknown>;
}

interface MatchInvalidatedPayload {
  matchEventId?: string;
}

interface MicrositeLinkPayload {
  kind?: string;
  demandId?: string;
  selectionId?: string;
  selectionToken?: string;
  buyerUrl?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeDemandDisplayName(params: {
  rawName: string | null | undefined;
  demandRef: string | null | undefined;
  demandId: string;
}): string {
  const raw = params.rawName?.trim() ?? "";
  if (!raw) return params.demandRef?.trim() || params.demandId;

  const lower = raw.toLowerCase();
  const isEmailLike = raw.includes("@");
  const isCallNoteLike =
    lower.includes("datos de la llamada") ||
    lower.includes("llamada") ||
    lower.includes("nota");
  const isPipeLikeNoise = /[|]/.test(raw);

  if (isEmailLike || isCallNoteLike || isPipeLikeNoise) {
    return params.demandRef?.trim() || params.demandId;
  }

  return raw;
}

/**
 * GET /api/matching/cruces
 *
 * Returns real MATCH_GENERADO events enriched with property and demand data.
 * Supports:
 *  - `limit`  – page size (default 30, max 100)
 *  - `cursor` – BigInt position; fetches events BEFORE this position (for "load more")
 *  - `since`  – ISO timestamp; only newer matches (for live polling)
 *  - `zona`   – filter by property zone
 */
const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 30, 100);
  const cursorParam = url.searchParams.get("cursor");
  const since = url.searchParams.get("since");
  const zona = url.searchParams.get("zona");
  const includeInvalidated = url.searchParams.get("includeInvalidated") === "1";

  const where: Record<string, unknown> = {
    type: "MATCH_GENERADO",
  };

  if (since) {
    where.createdAt = { gt: new Date(since) };
  } else if (cursorParam) {
    where.position = { lt: BigInt(cursorParam) };
  }

  // Fetch extra rows because invalidated matches are hidden by default after
  // reading the corresponding MATCH_INVALIDADO events.
  const take = includeInvalidated ? limit + 1 : Math.min(limit * 3 + 1, 301);
  const events = await prisma.event.findMany({
    where,
    orderBy: { position: "desc" },
    take,
  });

  const invalidationEvents = !includeInvalidated && events.length > 0
    ? await prisma.$queryRaw<Array<{ payload: unknown }>>(
        Prisma.sql`
          SELECT payload
          FROM events
          WHERE type::text = 'MATCH_INVALIDADO'
            AND payload->>'matchEventId' IN (${Prisma.join(events.map((ev) => ev.id))})
        `,
      )
    : [];
  const invalidatedMatchIds = new Set(
    invalidationEvents
      .map((ev) => (ev.payload as MatchInvalidatedPayload | null)?.matchEventId)
      .filter((id): id is string => Boolean(id)),
  );
  const visibleEvents = includeInvalidated
    ? events
    : events.filter((ev) => !invalidatedMatchIds.has(ev.id));
  const hasMore = visibleEvents.length > limit || events.length === take;
  const pageEvents = visibleEvents.slice(0, limit);

  const propertyIds = new Set<string>();
  const demandIds = new Set<string>();

  for (const ev of pageEvents) {
    const p = ev.payload as MatchEventPayload | null;
    if (p?.propertyId) propertyIds.add(p.propertyId);
    if (p?.demandId) demandIds.add(p.demandId);
  }

  const [properties, demands] = await Promise.all([
    propertyIds.size > 0
      ? prisma.propertyCurrent.findMany({
          where: { codigo: { in: [...propertyIds] } },
          select: {
            codigo: true,
            ref: true,
            titulo: true,
            tipoOfer: true,
            precio: true,
            metrosConstruidos: true,
            habitaciones: true,
            banyos: true,
            ciudad: true,
            zona: true,
            estado: true,
            numFotos: true,
            fechaAlta: true,
            mainPhotoUrl: true,
          },
        })
      : Promise.resolve([]),
    demandIds.size > 0
      ? prisma.demandCurrent.findMany({
          where: { codigo: { in: [...demandIds] } },
          select: {
            codigo: true,
            ref: true,
            nombre: true,
            presupuestoMin: true,
            presupuestoMax: true,
            habitacionesMin: true,
            tipos: true,
            zonas: true,
            telefono: true,
            leadStatus: true,
            metrosMin: true,
            metrosMax: true,
            estadoNombre: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const propMap = new Map(properties.map((p) => [p.codigo, p]));
  const demMap = new Map(demands.map((d) => [d.codigo, d]));
  const demandIdList = [...demandIds];

  const eventIds = pageEvents.map((ev) => ev.id);
  // El flag `whatsappEnviado` se infiere de la presencia de un evento
  // WHATSAPP_ENVIADO causado por el MATCH_GENERADO (envío en caliente,
  // ya no pasa por la cola de jobs SEND_WHATSAPP_MATCH).
  const sentEvents = eventIds.length > 0
    ? await prisma.event.findMany({
        where: {
          type: "WHATSAPP_ENVIADO",
          causationId: { in: eventIds },
          payload: { path: ["kind"], equals: "match_notification" },
        },
        select: { causationId: true },
      })
    : [];
  const sentEventIds = new Set(
    sentEvents.map((e) => e.causationId).filter((id): id is string => Boolean(id)),
  );

  const micrositeSendEvents = demandIdList.length > 0
    ? await prisma.$queryRaw<
        Array<{ aggregateId: string | null; occurredAt: Date; payload: unknown }>
      >(
        Prisma.sql`
          SELECT "aggregateId" AS "aggregateId", "occurredAt" AS "occurredAt", payload
          FROM events
          WHERE type::text = 'WHATSAPP_ENVIADO'
            AND payload->>'kind' = 'microsite_link'
            AND payload->>'demandId' IN (${Prisma.join(demandIdList)})
          ORDER BY "occurredAt" DESC
        `,
      )
    : [];

  const latestMicrositeSendByDemand = new Map<
    string,
    {
      waId: string | null;
      sentAt: string;
      selectionId: string | null;
      selectionToken: string | null;
      buyerUrl: string | null;
    }
  >();

  for (const row of micrositeSendEvents) {
    const payload = row.payload as MicrositeLinkPayload | null;
    const demandId = payload?.demandId;
    if (!demandId || latestMicrositeSendByDemand.has(demandId)) continue;
    latestMicrositeSendByDemand.set(demandId, {
      waId: row.aggregateId ?? null,
      sentAt: row.occurredAt.toISOString(),
      selectionId: payload?.selectionId ?? null,
      selectionToken: payload?.selectionToken ?? null,
      buyerUrl: payload?.buyerUrl ?? null,
    });
  }

  const sessions = demandIdList.length > 0
    ? await prisma.whatsAppBuyerSession.findMany({
        where: { demandId: { in: demandIdList } },
        select: {
          demandId: true,
          waId: true,
          selectionId: true,
          selectionToken: true,
          updatedAt: true,
        },
      })
    : [];
  const sessionByDemandId = new Map<string, (typeof sessions)[number]>();
  for (const session of sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())) {
    if (!sessionByDemandId.has(session.demandId)) {
      sessionByDemandId.set(session.demandId, session);
    }
  }

  const selectionIds = new Set<string>();
  for (const demandId of demandIdList) {
    const micrositeSent = latestMicrositeSendByDemand.get(demandId);
    if (micrositeSent?.selectionId) selectionIds.add(micrositeSent.selectionId);
    const session = sessionByDemandId.get(demandId);
    if (session?.selectionId) selectionIds.add(session.selectionId);
  }

  const selections = selectionIds.size > 0
    ? await prisma.micrositeSelection.findMany({
        where: { id: { in: [...selectionIds] } },
        select: { id: true, token: true, properties: true },
      })
    : [];
  const selectionById = new Map(selections.map((selection) => [selection.id, selection]));

  const waIds = new Set(
    sessions.map((session) => session.waId).filter((waId): waId is string => Boolean(waId)),
  );
  for (const sent of latestMicrositeSendByDemand.values()) {
    if (sent.waId) waIds.add(sent.waId);
  }
  const waIdList = [...waIds];

  const conversationCounts = waIdList.length > 0
    ? await prisma.event.groupBy({
        by: ["aggregateId", "type"],
        where: {
          aggregateType: "WHATSAPP_CONVERSATION",
          aggregateId: { in: waIdList },
          type: { in: ["WHATSAPP_RECIBIDO", "WHATSAPP_ENVIADO"] },
        },
        _count: { _all: true },
      })
    : [];
  const conversationLastMessage = waIdList.length > 0
    ? await prisma.event.groupBy({
        by: ["aggregateId"],
        where: {
          aggregateType: "WHATSAPP_CONVERSATION",
          aggregateId: { in: waIdList },
          type: { in: ["WHATSAPP_RECIBIDO", "WHATSAPP_ENVIADO"] },
        },
        _max: { occurredAt: true },
      })
    : [];

  const conversationStatsByWaId = new Map<
    string,
    { inbound: number; outbound: number; lastMessageAt: string | null }
  >();
  for (const waId of waIdList) {
    conversationStatsByWaId.set(waId, { inbound: 0, outbound: 0, lastMessageAt: null });
  }
  for (const row of conversationCounts) {
    const waId = row.aggregateId;
    if (!waId) continue;
    const stats = conversationStatsByWaId.get(waId) ?? { inbound: 0, outbound: 0, lastMessageAt: null };
    if (row.type === "WHATSAPP_RECIBIDO") stats.inbound = row._count._all;
    if (row.type === "WHATSAPP_ENVIADO") stats.outbound = row._count._all;
    conversationStatsByWaId.set(waId, stats);
  }
  for (const row of conversationLastMessage) {
    const waId = row.aggregateId;
    if (!waId) continue;
    const stats = conversationStatsByWaId.get(waId) ?? { inbound: 0, outbound: 0, lastMessageAt: null };
    stats.lastMessageAt = row._max.occurredAt ? row._max.occurredAt.toISOString() : null;
    conversationStatsByWaId.set(waId, stats);
  }

  const appUrl = getPublicAppUrl();

  type CruceItem = {
    id: string;
    fechaMatch: string;
    position: string;
    propiedad: {
      id: string;
      ref: string;
      titulo: string;
      tipoOfer: string;
      precio: number;
      metros: number;
      habitaciones: number;
      banyos: number;
      zona: string;
      ciudad: string;
      estado: string;
      numFotos: number;
      fechaAlta: string;
      mainPhotoUrl: string | null;
    };
    comprador: {
      id: string;
      ref: string;
      nombre: string;
      presupuestoMin: number;
      presupuestoMax: number;
      habitacionesMin: number;
      tipos: string;
      zonasInteres: string[];
      telefono: string;
      leadStatus: string;
      metrosMin: number | null;
      metrosMax: number | null;
      estadoNombre: string;
    };
    porcentajeMatch: number;
    matchScore: Record<string, unknown> | null;
    whatsappEnviado: boolean;
    trazabilidad: {
      micrositio: {
        enviado: boolean;
        enviadoAt: string | null;
        url: string | null;
        selectionId: string | null;
        selectionToken: string | null;
        propiedadesEnviadas: Array<{
          propertyId: string;
          title: string;
          price: number | null;
          zone: string | null;
          city: string | null;
        }>;
      };
      whatsapp: {
        waId: string | null;
        contactado: boolean;
        inboundCount: number;
        outboundCount: number;
        lastMessageAt: string | null;
        conversationUrl: string | null;
      };
    };
  };

  const cruces: CruceItem[] = [];

  for (const ev of pageEvents) {
    const p = ev.payload as MatchEventPayload | null;
    if (!p?.propertyId || !p?.demandId) continue;

    const prop = propMap.get(p.propertyId);
    const dem = demMap.get(p.demandId);

    const propData = {
      id: p.propertyId,
      ref: prop?.ref ?? p.propertyRef ?? "",
      titulo: prop?.titulo ?? p.propertyId,
      tipoOfer: prop?.tipoOfer ?? "",
      precio: prop?.precio ?? 0,
      metros: prop?.metrosConstruidos ?? 0,
      habitaciones: prop?.habitaciones ?? 0,
      banyos: prop?.banyos ?? 0,
      zona: prop?.zona ?? "",
      ciudad: prop?.ciudad ?? "",
      estado: prop?.estado ?? "",
      numFotos: prop?.numFotos ?? 0,
      fechaAlta: prop?.fechaAlta ?? "",
      mainPhotoUrl: prop?.mainPhotoUrl ?? null,
    };

    if (zona && zona !== "all" && propData.zona !== zona) continue;

    const demZonas = (dem?.zonas ?? "")
      .split(/[,|;]+/)
      .map((z) => z.trim())
      .filter(Boolean);

    const demData = {
      id: p.demandId,
      ref: dem?.ref ?? p.demandRef ?? "",
      nombre: normalizeDemandDisplayName({
        rawName: dem?.nombre ?? p.demandNombre,
        demandRef: dem?.ref ?? p.demandRef,
        demandId: p.demandId,
      }),
      presupuestoMin: dem?.presupuestoMin ?? 0,
      presupuestoMax: dem?.presupuestoMax ?? 0,
      habitacionesMin: dem?.habitacionesMin ?? 0,
      tipos: dem?.tipos ?? "",
      zonasInteres: demZonas,
      telefono: dem?.telefono ?? "",
      leadStatus: dem?.leadStatus ?? "NUEVO",
      metrosMin: dem?.metrosMin ?? null,
      metrosMax: dem?.metrosMax ?? null,
      estadoNombre: dem?.estadoNombre ?? "",
    };

    const micrositeSent = latestMicrositeSendByDemand.get(p.demandId);
    const session = sessionByDemandId.get(p.demandId);
    const traceSelectionId = micrositeSent?.selectionId ?? session?.selectionId ?? null;
    const traceSelectionToken =
      micrositeSent?.selectionToken ??
      session?.selectionToken ??
      (traceSelectionId ? selectionById.get(traceSelectionId)?.token ?? null : null);
    const traceSelection = traceSelectionId ? selectionById.get(traceSelectionId) : null;
    const micrositeUrl =
      micrositeSent?.buyerUrl ??
      (traceSelectionToken ? `${appUrl}/seleccion/${traceSelectionToken}` : null);
    const sentProperties = traceSelection
      ? coerceMicrositeCuratedProperties(traceSelection.properties)
          .map((property) => ({
            propertyId: property.propertyId,
            title: property.title,
            price: property.price,
            zone: property.zone,
            city: property.city,
          }))
      : [];

    const waId = micrositeSent?.waId ?? session?.waId ?? null;
    const waStats = waId ? conversationStatsByWaId.get(waId) : null;
    const inboundCount = waStats?.inbound ?? 0;
    const outboundCount = waStats?.outbound ?? 0;
    const contactado = inboundCount + outboundCount > 0;
    const conversationUrl = waId
      ? `/platform/conversaciones?waId=${encodeURIComponent(waId)}`
      : null;

    cruces.push({
      id: ev.id,
      fechaMatch: ev.createdAt.toISOString(),
      position: ev.position.toString(),
      propiedad: propData,
      comprador: demData,
      porcentajeMatch: p.totalScore ?? 0,
      matchScore: p.matchScore ?? null,
      whatsappEnviado: sentEventIds.has(ev.id),
      trazabilidad: {
        micrositio: {
          enviado: Boolean(micrositeSent),
          enviadoAt: micrositeSent?.sentAt ?? null,
          url: micrositeUrl,
          selectionId: traceSelectionId,
          selectionToken: traceSelectionToken,
          propiedadesEnviadas: sentProperties,
        },
        whatsapp: {
          waId,
          contactado,
          inboundCount,
          outboundCount,
          lastMessageAt: waStats?.lastMessageAt ?? null,
          conversationUrl,
        },
      },
    });
  }

  const allZonas = [...new Set(cruces.map((c) => c.propiedad.zona).filter(Boolean))];

  // nextCursor is the position of the last event in the page (oldest), for "load more"
  const lastPosition = pageEvents.at(-1)?.position;
  const nextCursor = hasMore && lastPosition != null ? lastPosition.toString() : null;

  const [globalTotalMatches, globalInvalidations] = await Promise.all([
    prisma.event.count({ where: { type: "MATCH_GENERADO" } }),
    includeInvalidated
      ? Promise.resolve([])
      : prisma.$queryRaw<Array<{ payload: unknown }>>(
          Prisma.sql`
            SELECT payload
            FROM events
            WHERE type::text = 'MATCH_INVALIDADO'
          `,
        ),
  ]);
  const globalInvalidatedMatchIds = new Set(
    globalInvalidations
      .map((ev) => (ev.payload as MatchInvalidatedPayload | null)?.matchEventId)
      .filter((id): id is string => Boolean(id)),
  );
  const globalTotal = includeInvalidated
    ? globalTotalMatches
    : Math.max(0, globalTotalMatches - globalInvalidatedMatchIds.size);

  return NextResponse.json({
    cruces,
    total: globalTotal,
    invalidatedHidden: includeInvalidated ? 0 : globalInvalidatedMatchIds.size,
    pageSize: cruces.length,
    hasMore,
    nextCursor,
    zonas: allZonas,
  });
};

export const dynamic = 'force-dynamic';

export const GET = withObservedRoute(
  { method: "GET", route: "/api/matching/cruces" },
  getHandler,
);
