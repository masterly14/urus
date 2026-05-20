import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";

interface MatchEventPayload {
  demandId?: string;
  demandRef?: string;
  demandNombre?: string;
  propertyId?: string;
  propertyRef?: string;
  totalScore?: number;
  matchScore?: Record<string, unknown>;
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

  const where: Record<string, unknown> = {
    type: "MATCH_GENERADO",
  };

  if (since) {
    where.createdAt = { gt: new Date(since) };
  } else if (cursorParam) {
    where.position = { lt: BigInt(cursorParam) };
  }

  // Fetch one extra to detect if there's a next page
  const events = await prisma.event.findMany({
    where,
    orderBy: { position: "desc" },
    take: limit + 1,
  });

  const hasMore = events.length > limit;
  const pageEvents = hasMore ? events.slice(0, limit) : events;

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
      nombre: dem?.nombre ?? p.demandNombre ?? p.demandId,
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

    cruces.push({
      id: ev.id,
      fechaMatch: ev.createdAt.toISOString(),
      position: ev.position.toString(),
      propiedad: propData,
      comprador: demData,
      porcentajeMatch: p.totalScore ?? 0,
      matchScore: p.matchScore ?? null,
      whatsappEnviado: sentEventIds.has(ev.id),
    });
  }

  const allZonas = [...new Set(cruces.map((c) => c.propiedad.zona).filter(Boolean))];

  // nextCursor is the position of the last event in the page (oldest), for "load more"
  const lastPosition = pageEvents.at(-1)?.position;
  const nextCursor = hasMore && lastPosition != null ? lastPosition.toString() : null;

  const globalTotal = await prisma.event.count({ where: { type: "MATCH_GENERADO" } });

  return NextResponse.json({
    cruces,
    total: globalTotal,
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
