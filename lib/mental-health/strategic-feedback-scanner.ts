/**
 * M12 — Capa 5: feedback estratégico agregado (sin exponer conversaciones).
 *
 * Lee eventos MENTAL_* del Event Store, agrega por comercial y genera candidatos
 * a DashboardAlert + notificación vía alertGeneric (CEO / canal configurado).
 */

import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type MentalStrategicAlertType =
  | "mh_energy_low"
  | "mh_bloqueo_recurrente"
  | "mh_sobrecarga_uso";

export type DashboardStyleSeverity = "low" | "medium" | "high";

export interface MentalStrategicAlertCandidate {
  comercialId: string;
  comercialNombre: string;
  type: MentalStrategicAlertType;
  severity: DashboardStyleSeverity;
  metric: string;
  message: string;
  currentValue: number | null;
  baselineValue: number | null;
  threshold: number | null;
  details: Record<string, unknown>;
}

export interface MentalStrategicScanResult {
  alerts: MentalStrategicAlertCandidate[];
  energyCount: number;
  bloqueoCount: number;
  sobrecargaCount: number;
  deduplicatedCount: number;
  comercialesConDatos: number;
}

export interface MentalStrategicAlertConfig {
  windowDays: number;
  deduplicationWindowDays: number;
  /** Mínimo de respuestas del coach con clasificación válida para señales de energía/bloqueo */
  minClassifiedCoachReplies: number;
  /** Media de nivelEnergia (1–5) por debajo de este umbral → alerta energía */
  energyAvgThreshold: number;
  /** Si la media es ≤ este valor (y hay muestras suficientes), severidad alta */
  energyAvgCriticalThreshold: number;
  /** Mínimo de clasificaciones con flujo bloqueo en la ventana */
  minBloqueoHits: number;
  bloqueoHitsMedium: number;
  bloqueoHitsHigh: number;
  /** Mensajes entrantes del comercial (MENTAL_MSG_RECIBIDO) en la ventana */
  inboundHigh: number;
  inboundCritical: number;
}

// ---------------------------------------------------------------------------
// Config desde env
// ---------------------------------------------------------------------------

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
}

function envFloat(key: string, fallback: number): number {
  const raw = process.env[key];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getMentalStrategicAlertConfig(): MentalStrategicAlertConfig {
  return {
    windowDays: envInt("MENTAL_STRATEGIC_WINDOW_DAYS", 7),
    deduplicationWindowDays: envInt("MENTAL_STRATEGIC_DEDUP_DAYS", 7),
    minClassifiedCoachReplies: envInt("MENTAL_STRATEGIC_MIN_CLASSIFIED", 4),
    energyAvgThreshold: envFloat("MENTAL_STRATEGIC_ENERGY_AVG_MAX", 2.25),
    energyAvgCriticalThreshold: envFloat("MENTAL_STRATEGIC_ENERGY_AVG_CRITICAL", 1.75),
    minBloqueoHits: envInt("MENTAL_STRATEGIC_BLOQUEO_MIN", 3),
    bloqueoHitsMedium: envInt("MENTAL_STRATEGIC_BLOQUEO_MED", 5),
    bloqueoHitsHigh: envInt("MENTAL_STRATEGIC_BLOQUEO_HIGH", 8),
    inboundHigh: envInt("MENTAL_STRATEGIC_INBOUND_HIGH", 28),
    inboundCritical: envInt("MENTAL_STRATEGIC_INBOUND_CRITICAL", 45),
  };
}

// ---------------------------------------------------------------------------
// Agregación en memoria (testeable)
// ---------------------------------------------------------------------------

export interface ClassifiedCoachPayload {
  flujo: string;
  nivelEnergia: number;
}

export interface WaAggregate {
  waId: string;
  comercialId: string | null;
  inboundCount: number;
  classifiedFromCoach: ClassifiedCoachPayload[];
}

function parseClassification(raw: unknown): ClassifiedCoachPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const flujo = typeof o.flujo === "string" ? o.flujo : null;
  const nivel = o.nivelEnergia;
  const nivelEnergia =
    typeof nivel === "number" && Number.isFinite(nivel)
      ? Math.round(nivel)
      : null;
  if (!flujo || nivelEnergia === null || nivelEnergia < 1 || nivelEnergia > 5) {
    return null;
  }
  return { flujo, nivelEnergia };
}

/** Agrupa eventos por waId y extrae conteos agregados (sin texto de usuario). */
export function aggregateMentalEventsByWaId(
  rows: Array<{
    aggregateId: string;
    type: string;
    payload: unknown;
  }>,
): Map<string, WaAggregate> {
  const map = new Map<string, WaAggregate>();

  for (const row of rows) {
    const waId = row.aggregateId;
    let agg = map.get(waId);
    if (!agg) {
      agg = {
        waId,
        comercialId: null,
        inboundCount: 0,
        classifiedFromCoach: [],
      };
      map.set(waId, agg);
    }

    const p = row.payload as Record<string, unknown> | null;
    if (!p) continue;

    const cid = p.comercialId;
    if (typeof cid === "string" && cid.length > 0) {
      agg.comercialId = cid;
    }

    if (row.type === "MENTAL_MSG_RECIBIDO") {
      agg.inboundCount += 1;
    }

    if (row.type === "MENTAL_MSG_ENVIADO") {
      if (p.isWelcome === true) continue;
      const c = parseClassification(p.classification);
      if (c) {
        agg.classifiedFromCoach.push(c);
      }
    }
  }

  return map;
}

/** Une agregados por waId en uno por comercialId (suma mensajes y clasificaciones). */
export function mergeWaAggregatesByComercialId(
  byWa: Map<string, WaAggregate>,
): Map<string, WaAggregate> {
  const byComercial = new Map<string, WaAggregate>();

  for (const agg of byWa.values()) {
    const comercialId = agg.comercialId;
    if (!comercialId) continue;

    const existing = byComercial.get(comercialId);
    if (!existing) {
      byComercial.set(comercialId, {
        waId: agg.waId,
        comercialId,
        inboundCount: agg.inboundCount,
        classifiedFromCoach: [...agg.classifiedFromCoach],
      });
      continue;
    }

    existing.inboundCount += agg.inboundCount;
    existing.classifiedFromCoach.push(...agg.classifiedFromCoach);
  }

  return byComercial;
}

export function buildCandidatesFromAggregates(
  aggregates: Iterable<WaAggregate>,
  namesByComercialId: Map<string, string>,
  config: MentalStrategicAlertConfig,
): MentalStrategicAlertCandidate[] {
  const alerts: MentalStrategicAlertCandidate[] = [];

  for (const agg of aggregates) {
    const comercialId = agg.comercialId;
    if (!comercialId) continue;

    const comercialNombre = namesByComercialId.get(comercialId) ?? "Comercial";

    const classified = agg.classifiedFromCoach;
    const nClassified = classified.length;

    if (nClassified >= config.minClassifiedCoachReplies) {
      const sumE = classified.reduce((a, s) => a + s.nivelEnergia, 0);
      const avgEnergy = sumE / nClassified;

      if (avgEnergy <= config.energyAvgThreshold) {
        const severity: DashboardStyleSeverity =
          avgEnergy <= config.energyAvgCriticalThreshold ? "high" : "medium";
        alerts.push({
          comercialId,
          comercialNombre,
          type: "mh_energy_low",
          severity,
          metric: "avg_energy_level",
          message:
            `Señal operativa (coach): energía baja sostenida en los últimos ${config.windowDays} días ` +
            `(media ${avgEnergy.toFixed(2)}/5 en ${nClassified} interacciones clasificadas). ` +
            `Sin contenido de conversación.`,
          currentValue: Math.round(avgEnergy * 100) / 100,
          baselineValue: null,
          threshold: config.energyAvgThreshold,
          details: {
            windowDays: config.windowDays,
            sampleSize: nClassified,
            avgEnergy: Math.round(avgEnergy * 100) / 100,
          },
        });
      }
    }

    const bloqueoHits = classified.filter((c) => c.flujo === "bloqueo").length;
    if (bloqueoHits >= config.minBloqueoHits) {
      let severity: DashboardStyleSeverity = "low";
      if (bloqueoHits >= config.bloqueoHitsHigh) severity = "high";
      else if (bloqueoHits >= config.bloqueoHitsMedium) severity = "medium";

      alerts.push({
        comercialId,
        comercialNombre,
        type: "mh_bloqueo_recurrente",
        severity,
        metric: "bloqueo_hits",
        message:
          `Señal operativa (coach): patrón de bloqueo recurrente (${bloqueoHits} clasificaciones tipo bloqueo en ${config.windowDays} días). ` +
          `Sin contenido de conversación.`,
        currentValue: bloqueoHits,
        baselineValue: null,
        threshold:
          severity === "high"
            ? config.bloqueoHitsHigh
            : severity === "medium"
              ? config.bloqueoHitsMedium
              : config.minBloqueoHits,
        details: {
          windowDays: config.windowDays,
          bloqueoHits,
        },
      });
    }

    if (agg.inboundCount >= config.inboundHigh) {
      const severity: DashboardStyleSeverity =
        agg.inboundCount >= config.inboundCritical ? "high" : "medium";
      alerts.push({
        comercialId,
        comercialNombre,
        type: "mh_sobrecarga_uso",
        severity,
        metric: "inbound_messages",
        message:
          `Señal operativa (coach): uso muy intensivo del coach (${agg.inboundCount} mensajes entrantes en ${config.windowDays} días). ` +
          `Puede indicar sobrecarga operativa; no se incluye texto de conversación.`,
        currentValue: agg.inboundCount,
        baselineValue: null,
        threshold:
          severity === "high" ? config.inboundCritical : config.inboundHigh,
        details: {
          windowDays: config.windowDays,
          inboundMessages: agg.inboundCount,
        },
      });
    }
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Dedup (misma clave que dashboard comercial)
// ---------------------------------------------------------------------------

async function deduplicateStrategicAlerts(
  candidates: MentalStrategicAlertCandidate[],
  windowDays: number,
  now: Date,
): Promise<MentalStrategicAlertCandidate[]> {
  if (candidates.length === 0) return [];

  const dayMs = 24 * 60 * 60 * 1000;
  const windowStart = new Date(now.getTime() - windowDays * dayMs);

  const recentAlerts = await prisma.dashboardAlert.findMany({
    where: {
      createdAt: { gte: windowStart },
      resolvedAt: null,
    },
    select: {
      comercialId: true,
      type: true,
      metric: true,
    },
  });

  const recentKeys = new Set(
    recentAlerts.map((a) => `${a.comercialId}:${a.type}:${a.metric}`),
  );

  return candidates.filter(
    (c) => !recentKeys.has(`${c.comercialId}:${c.type}:${c.metric}`),
  );
}

// ---------------------------------------------------------------------------
// Orquestador (BD)
// ---------------------------------------------------------------------------

export async function scanMentalHealthStrategicAlerts(
  now = new Date(),
): Promise<MentalStrategicScanResult> {
  const config = getMentalStrategicAlertConfig();
  const dayMs = 24 * 60 * 60 * 1000;
  const windowStart = new Date(now.getTime() - config.windowDays * dayMs);

  const rows = await prisma.event.findMany({
    where: {
      aggregateType: "MENTAL_CONVERSATION",
      occurredAt: { gte: windowStart },
      type: { in: ["MENTAL_MSG_RECIBIDO", "MENTAL_MSG_ENVIADO"] },
    },
    select: {
      aggregateId: true,
      type: true,
      payload: true,
    },
  });

  const byWa = aggregateMentalEventsByWaId(rows);

  const waNeedingComercial = [...byWa.values()].filter((a) => !a.comercialId);
  if (waNeedingComercial.length > 0) {
    const waIds = waNeedingComercial.map((w) => w.waId);
    const sessions = await prisma.mentalHealthSession.findMany({
      where: { waId: { in: waIds } },
      select: { waId: true, comercialId: true },
    });
    const sessionMap = new Map(sessions.map((s) => [s.waId, s.comercialId]));
    for (const agg of waNeedingComercial) {
      const cid = sessionMap.get(agg.waId);
      if (cid) agg.comercialId = cid;
    }
  }

  const byComercial = mergeWaAggregatesByComercialId(byWa);

  const comercialIds = new Set<string>(byComercial.keys());

  const comerciales = await prisma.comercial.findMany({
    where: { id: { in: [...comercialIds] } },
    select: { id: true, nombre: true },
  });
  const namesById = new Map(comerciales.map((c) => [c.id, c.nombre]));

  const rawCandidates = buildCandidatesFromAggregates(
    byComercial.values(),
    namesById,
    config,
  );

  const energyCount = rawCandidates.filter((a) => a.type === "mh_energy_low").length;
  const bloqueoCount = rawCandidates.filter(
    (a) => a.type === "mh_bloqueo_recurrente",
  ).length;
  const sobrecargaCount = rawCandidates.filter(
    (a) => a.type === "mh_sobrecarga_uso",
  ).length;

  const deduped = await deduplicateStrategicAlerts(
    rawCandidates,
    config.deduplicationWindowDays,
    now,
  );

  return {
    alerts: deduped,
    energyCount,
    bloqueoCount,
    sobrecargaCount,
    deduplicatedCount: rawCandidates.length - deduped.length,
    comercialesConDatos: comercialIds.size,
  };
}
