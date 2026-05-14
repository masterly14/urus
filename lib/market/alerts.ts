/**
 * Sistema de alertas guardadas del Core de Mercado.
 *
 * Modelo:
 *  - MarketSavedAlert: una busqueda persistente por usuario (filtros + canales
 *    + frecuencia).
 *  - MarketAlertDelivery: registro idempotente de matches entregados.
 *
 * Flujo:
 *  1. El cron `run-rules` (convertido en evaluador) corre con la cadencia
 *     configurada (cada 10 min por defecto).
 *  2. Para cada alerta `active=true` cuyo `lastEvaluatedAt` haya superado el
 *     intervalo de su `frequency`, se ejecuta `evaluateAlert(alert)`.
 *  3. `evaluateAlert` busca MarketEvent (CREATED, PRICE_CHANGED, REACTIVATED)
 *     desde `lastEvaluatedAt` que matcheen los filtros del listing asociado.
 *  4. Para cada match nuevo (no presente en MarketAlertDelivery con la misma
 *     dedupeKey) se entrega por los canales configurados:
 *       - in_app: persiste un Notification en canal user-{userId} y dispara
 *         Pusher en `private-notifications-user-{userId}`.
 *       - whatsapp: envia plantilla `WHATSAPP_TEMPLATE_MARKET_ALERT` con
 *         resumen del match al telefono del usuario (si esta definido).
 *  5. Marca `lastEvaluatedAt = now`. Si hubo entrega, tambien
 *     `lastDeliveredAt = now` y `deliveryCount += entregas`.
 *
 * Decisiones MVP:
 *  - WhatsApp envia 1 mensaje resumen por evaluacion con N matches (no 1 msg
 *    por match) para no saturar la conversacion ni quemar plantillas Meta.
 *  - frequency: realtime = 5 min minimo entre evaluaciones; hourly = 60 min;
 *    daily = 24 h.
 *  - Filtros admitidos: misma forma que /api/market/properties/search
 *    (city, sources, operation, advertiserType, hasPhone, priceMin/Max,
 *    areaMin/Max, roomsMin, polygon).
 */

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { pointInPolygon, type Polygon } from "./geo/polygon";
import type { MarketSource } from "./types";

// ---------------------------------------------------------------------------
// Tipos publicos
// ---------------------------------------------------------------------------

export type AlertChannel = "in_app" | "whatsapp";
export type AlertFrequency = "realtime" | "hourly" | "daily";

export interface AlertFilters {
  city?: string;
  sources?: MarketSource[];
  operation?: "sale" | "rent";
  advertiserType?: "particular" | "agency";
  hasPhone?: boolean;
  priceMin?: number;
  priceMax?: number;
  areaMin?: number;
  areaMax?: number;
  roomsMin?: number;
  polygon?: Polygon;
}

export interface SavedAlertDTO {
  id: string;
  userId: string;
  name: string;
  filters: AlertFilters;
  channels: AlertChannel[];
  frequency: AlertFrequency;
  active: boolean;
  lastEvaluatedAt: string | null;
  lastDeliveredAt: string | null;
  deliveryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAlertInput {
  userId: string;
  name: string;
  filters: AlertFilters;
  channels: AlertChannel[];
  frequency: AlertFrequency;
  active?: boolean;
}

export interface UpdateAlertInput {
  name?: string;
  filters?: AlertFilters;
  channels?: AlertChannel[];
  frequency?: AlertFrequency;
  active?: boolean;
}

const FREQUENCY_INTERVAL_MS: Record<AlertFrequency, number> = {
  realtime: 5 * 60 * 1000,
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
};

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listAlertsForUser(userId: string): Promise<SavedAlertDTO[]> {
  const rows = await prisma.marketSavedAlert.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(rowToDTO);
}

export async function createAlert(
  input: CreateAlertInput,
): Promise<SavedAlertDTO> {
  const created = await prisma.marketSavedAlert.create({
    data: {
      userId: input.userId,
      name: input.name,
      filters: input.filters as unknown as Prisma.InputJsonValue,
      channels: input.channels,
      frequency: input.frequency,
      active: input.active ?? true,
    },
  });
  return rowToDTO(created);
}

export async function updateAlert(
  id: string,
  userId: string,
  input: UpdateAlertInput,
): Promise<SavedAlertDTO | null> {
  // Solo el owner puede modificar.
  const existing = await prisma.marketSavedAlert.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) return null;

  const updated = await prisma.marketSavedAlert.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.filters !== undefined
        ? { filters: input.filters as unknown as Prisma.InputJsonValue }
        : {}),
      ...(input.channels !== undefined ? { channels: input.channels } : {}),
      ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
  });
  return rowToDTO(updated);
}

export async function deleteAlert(id: string, userId: string): Promise<boolean> {
  const existing = await prisma.marketSavedAlert.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) return false;
  await prisma.marketSavedAlert.delete({ where: { id } });
  return true;
}

// ---------------------------------------------------------------------------
// Test (evaluar sin entregar)
// ---------------------------------------------------------------------------

export async function testAlert(
  id: string,
  userId: string,
): Promise<{ matches: number; sample: { listingId: string; price: number | null }[] } | null> {
  const alert = await prisma.marketSavedAlert.findUnique({ where: { id } });
  if (!alert || alert.userId !== userId) return null;

  // Para test usamos una ventana fija de 7 dias.
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const filters = alert.filters as unknown as AlertFilters;
  const matches = await findMatchingListings(filters, since, 200);
  return {
    matches: matches.length,
    sample: matches.slice(0, 10).map((m) => ({ listingId: m.id, price: m.price })),
  };
}

// ---------------------------------------------------------------------------
// Evaluator (cron)
// ---------------------------------------------------------------------------

export interface EvaluateAllResult {
  evaluatedAlerts: number;
  totalDeliveries: number;
  errors: { alertId: string; message: string }[];
}

export async function evaluateAllDueAlerts(now = new Date()): Promise<EvaluateAllResult> {
  // Se carga todo el set; el volumen de alertas se espera bajo (<<1k).
  const alerts = await prisma.marketSavedAlert.findMany({
    where: { active: true },
  });

  let evaluatedAlerts = 0;
  let totalDeliveries = 0;
  const errors: { alertId: string; message: string }[] = [];

  for (const alert of alerts) {
    const interval = FREQUENCY_INTERVAL_MS[alert.frequency as AlertFrequency] ?? FREQUENCY_INTERVAL_MS.hourly;
    const last = alert.lastEvaluatedAt ?? new Date(0);
    if (now.getTime() - last.getTime() < interval) continue;

    try {
      const result = await evaluateAlert(alert.id, now);
      evaluatedAlerts += 1;
      totalDeliveries += result.deliveriesCreated;
    } catch (err) {
      errors.push({
        alertId: alert.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { evaluatedAlerts, totalDeliveries, errors };
}

interface EvaluateAlertResult {
  deliveriesCreated: number;
  matchesFound: number;
}

export async function evaluateAlert(
  alertId: string,
  now = new Date(),
): Promise<EvaluateAlertResult> {
  const alert = await prisma.marketSavedAlert.findUnique({ where: { id: alertId } });
  if (!alert) throw new Error("Alerta no encontrada");
  if (!alert.active) return { deliveriesCreated: 0, matchesFound: 0 };

  const filters = alert.filters as unknown as AlertFilters;
  const since = alert.lastEvaluatedAt ?? new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const matches = await findMatchingListings(filters, since, 200);

  // Intentar persistir delivery por canal con dedupeKey unico.
  let deliveriesCreated = 0;
  const userPhone = await resolveUserPhone(alert.userId);
  const matchesForWhatsapp: typeof matches = [];

  for (const match of matches) {
    for (const channel of alert.channels as AlertChannel[]) {
      const dedupeKey = computeDedupeKey({
        alertId: alert.id,
        listingId: match.id,
        channel,
        day: now.toISOString().slice(0, 10),
      });
      try {
        await prisma.marketAlertDelivery.create({
          data: {
            alertId: alert.id,
            listingId: match.id,
            channel,
            dedupeKey,
            payload: {
              propertyId: match.propertyId ?? null,
              price: match.price,
              city: match.city,
              zone: match.zone,
              source: match.source,
            },
          },
        });
        deliveriesCreated += 1;
        if (channel === "in_app") {
          await deliverInApp({
            alert,
            match,
          });
        } else if (channel === "whatsapp") {
          matchesForWhatsapp.push(match);
        }
      } catch (err) {
        // Si es un constraint unique de dedupeKey, lo ignoramos (idempotencia).
        if (err instanceof Error && /Unique constraint/i.test(err.message)) {
          continue;
        }
        throw err;
      }
    }
  }

  // WhatsApp: 1 mensaje resumen por evaluacion (no por match).
  if (matchesForWhatsapp.length > 0 && userPhone) {
    try {
      await deliverWhatsappSummary({
        alert,
        matches: matchesForWhatsapp,
        toPhone: userPhone,
      });
    } catch (err) {
      console.warn(
        `[market:alerts] WhatsApp delivery failed for alert ${alert.id}: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  await prisma.marketSavedAlert.update({
    where: { id: alert.id },
    data: {
      lastEvaluatedAt: now,
      ...(deliveriesCreated > 0
        ? {
            lastDeliveredAt: now,
            deliveryCount: { increment: deliveriesCreated },
          }
        : {}),
    },
  });

  return { deliveriesCreated, matchesFound: matches.length };
}

// ---------------------------------------------------------------------------
// Match query
// ---------------------------------------------------------------------------

interface ListingMatch {
  id: string;
  propertyId: string | null;
  source: MarketSource;
  city: string;
  zone: string | null;
  price: number | null;
  builtArea: number | null;
  rooms: number | null;
  lat: number | null;
  lng: number | null;
  addressApprox: string | null;
  pricePerMeter: number | null;
}

async function findMatchingListings(
  filters: AlertFilters,
  since: Date,
  limit: number,
): Promise<ListingMatch[]> {
  const where: Prisma.MarketListingWhereInput = {
    status: { in: ["active", "unknown"] },
    OR: [
      { firstSeenAt: { gte: since } },
      { lastChangeAt: { gte: since } },
    ],
  };
  if (filters.city) {
    where.city = { startsWith: filters.city, mode: "insensitive" };
  }
  if (filters.sources && filters.sources.length > 0) {
    where.source = { in: filters.sources };
  }
  if (filters.operation) where.operation = filters.operation;
  if (filters.advertiserType) where.advertiserType = filters.advertiserType;

  if (filters.priceMin != null || filters.priceMax != null) {
    where.price = {};
    if (filters.priceMin != null) where.price.gte = filters.priceMin;
    if (filters.priceMax != null) where.price.lte = filters.priceMax;
  }
  if (filters.areaMin != null || filters.areaMax != null) {
    where.builtArea = {};
    if (filters.areaMin != null) where.builtArea.gte = filters.areaMin;
    if (filters.areaMax != null) where.builtArea.lte = filters.areaMax;
  }
  if (filters.roomsMin != null) {
    where.rooms = { gte: filters.roomsMin };
  }
  if (filters.hasPhone) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      {
        OR: [
          { advertiser: { phoneCanonical: { not: null } } },
          { phones: { isEmpty: false } },
        ],
      },
    ];
  }

  const rows = await prisma.marketListing.findMany({
    where,
    orderBy: [{ lastSeenAt: "desc" }],
    take: limit,
    select: {
      id: true,
      propertyId: true,
      source: true,
      city: true,
      zone: true,
      price: true,
      builtArea: true,
      rooms: true,
      lat: true,
      lng: true,
      addressApprox: true,
      pricePerMeter: true,
    },
  });

  // Polygon en memoria (pequeño, suele ser <500 puntos).
  if (filters.polygon && filters.polygon.length >= 3) {
    return rows.filter(
      (r) =>
        r.lat != null &&
        r.lng != null &&
        pointInPolygon([r.lng, r.lat], filters.polygon!),
    );
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

async function deliverInApp({
  alert,
  match,
}: {
  alert: { id: string; userId: string; name: string };
  match: ListingMatch;
}): Promise<void> {
  const channel = `private-notifications-user-${alert.userId}`;
  const title = `Nuevo match: ${alert.name}`;
  const description = `${match.addressApprox ?? match.zone ?? match.city}${
    match.price != null ? ` · ${match.price.toLocaleString("es-ES")} €` : ""
  }`;

  try {
    await prisma.notification.create({
      data: {
        userId: alert.userId,
        channel,
        source: "market.alert",
        severity: "info",
        title,
        description,
        eventType: "MARKET_SAVED_ALERT_MATCH",
      },
    });
  } catch (err) {
    console.error(
      `[market:alerts] error persisting notification: ${
        err instanceof Error ? err.message : err
      }`,
    );
  }

  try {
    const { getPusherServer } = await import("@/lib/pusher/server");
    const pusher = getPusherServer();
    await pusher.trigger(channel, "notification", {
      id: `market-alert:${alert.id}:${match.id}`,
      source: "market.alert",
      severity: "info",
      title,
      description,
      timestamp: new Date().toISOString(),
      read: false,
      eventType: "MARKET_SAVED_ALERT_MATCH",
    });
  } catch (err) {
    console.warn(
      `[market:alerts] Pusher trigger failed: ${
        err instanceof Error ? err.message : err
      }`,
    );
  }
}

async function deliverWhatsappSummary({
  alert,
  matches,
  toPhone,
}: {
  alert: { id: string; name: string };
  matches: ListingMatch[];
  toPhone: string;
}): Promise<void> {
  const templateName = process.env.WHATSAPP_TEMPLATE_MARKET_ALERT?.trim();
  const language = process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "es";
  if (!templateName) {
    console.warn(
      `[market:alerts] WHATSAPP_TEMPLATE_MARKET_ALERT no configurada; saltando WhatsApp.`,
    );
    return;
  }

  const summary = matches
    .slice(0, 5)
    .map((m) => {
      const where = m.zone ?? m.city;
      const price = m.price != null ? `${m.price.toLocaleString("es-ES")} €` : "—";
      return `• ${where}: ${price}`;
    })
    .join("\n");

  const totalSuffix =
    matches.length > 5 ? `\n…y ${matches.length - 5} más` : "";

  const { sendTemplateMessage } = await import("@/lib/whatsapp/send");
  await sendTemplateMessage(toPhone, {
    name: templateName,
    language: { code: language },
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: alert.name },
          { type: "text", text: String(matches.length) },
          { type: "text", text: `${summary}${totalSuffix}` },
        ],
      },
    ],
  });
}

async function resolveUserPhone(userId: string): Promise<string | null> {
  // Asume que el comercial tiene `telefono` en su modelo Comercial. Si no es
  // comercial, no enviamos WhatsApp (la app no expone telefono de admins por
  // defecto). El opsis: solo entrega WhatsApp para users con comercial activo.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      comercial: { select: { telefono: true } },
    },
  });
  return user?.comercial?.telefono ?? null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeDedupeKey(input: {
  alertId: string;
  listingId: string;
  channel: string;
  day: string;
}): string {
  const data = `${input.alertId}|${input.listingId}|${input.channel}|${input.day}`;
  return createHash("sha256").update(data).digest("hex");
}

function rowToDTO(
  row: Awaited<ReturnType<typeof prisma.marketSavedAlert.findFirst>>,
): SavedAlertDTO {
  if (!row) throw new Error("rowToDTO null");
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    filters: row.filters as unknown as AlertFilters,
    channels: row.channels as AlertChannel[],
    frequency: row.frequency as AlertFrequency,
    active: row.active,
    lastEvaluatedAt: row.lastEvaluatedAt
      ? row.lastEvaluatedAt.toISOString()
      : null,
    lastDeliveredAt: row.lastDeliveredAt
      ? row.lastDeliveredAt.toISOString()
      : null,
    deliveryCount: row.deliveryCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
