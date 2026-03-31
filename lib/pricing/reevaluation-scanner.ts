/**
 * Scanner de reevaluación de pricing (M7 Item 3).
 *
 * Cron-job diario que evalúa propiedades activas buscando patrones de
 * inactividad comercial y encola RUN_PRICING_ANALYSIS con opciones
 * reducidas (menos páginas Statefox, sin LLM) para mitigar cuellos de botella.
 *
 * Trigger A — Inmueble sin leads X días:
 *   PropertyCurrent activa con edad >= DAYS_WITHOUT_LEADS y 0 eventos
 *   MATCH_GENERADO referenciando la propiedad.
 *
 * Trigger B — Inmueble con visitas sin ofertas:
 *   3+ eventos VISITA_EVALUADA con payload.propertyCode = código y 0
 *   eventos ESTADO_CAMBIADO cuyo newEstado implique oferta (reserva/señal/arras).
 */

import { prisma } from "@/lib/prisma";
import { enqueueJob } from "@/lib/job-queue";

// ---------------------------------------------------------------------------
// Constantes configurables
// ---------------------------------------------------------------------------

/** Días sin ningún match para disparar reevaluación. */
export const DAYS_WITHOUT_LEADS = 14;

/** Mínimo de visitas sin oferta para disparar reevaluación. */
export const MIN_VISITS_WITHOUT_OFFER = 3;

/** Días desde el último PRICING_ANALISIS_GENERADO para permitir nueva reevaluación. */
export const COOLDOWN_DAYS = 7;

/** Milisegundos de separación entre availableAt de jobs encolados. */
export const STAGGER_MS = 30_000;

/** Páginas máximas de Statefox /snapshot para reevaluaciones (vs 30 default). */
export const REEVAL_MAX_PAGES = 5;

/** Omitir motor de recomendación LangGraph en reevaluaciones. */
export const REEVAL_GENERATE_RECOMMENDATION = false;

/** Máximo de propiedades a encolar por ejecución del scanner. */
export const MAX_PROPERTIES_PER_SCAN = 100;

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type ReevalTrigger = "no_leads_reeval" | "visits_no_offer_reeval";

export interface ReevaluationScanResult {
  propertiesScanned: number;
  skippedByCooldown: number;
  enqueuedNoLeads: number;
  enqueuedVisitsNoOffer: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function parsePropertyAge(fechaAlta: string, createdAt: Date): number {
  const now = Date.now();
  if (fechaAlta) {
    const parsed = new Date(fechaAlta).getTime();
    if (!Number.isNaN(parsed)) {
      return Math.floor((now - parsed) / (1000 * 60 * 60 * 24));
    }
  }
  return Math.floor((now - createdAt.getTime()) / (1000 * 60 * 60 * 24));
}

/** Keywords que indican oferta aceptada — alineados con smart-closing-handler.ts */
export const OFFER_KEYWORDS = [
  "reserva",
  "reservada",
  "señal",
  "senal",
  "arras",
] as const;

// ---------------------------------------------------------------------------
// Consultas atómicas por propiedad
// ---------------------------------------------------------------------------

async function hasRecentAnalysis(
  propertyCode: string,
  cooldownSince: Date,
): Promise<boolean> {
  const row = await prisma.event.findFirst({
    where: {
      type: "PRICING_ANALISIS_GENERADO",
      aggregateType: "PROPERTY",
      aggregateId: propertyCode,
      occurredAt: { gte: cooldownSince },
    },
    select: { id: true },
  });
  return row !== null;
}

async function countMatchesForProperty(propertyCode: string): Promise<number> {
  return prisma.event.count({
    where: {
      type: "MATCH_GENERADO",
      aggregateType: "MATCH",
      aggregateId: { endsWith: `:${propertyCode}` },
    },
  });
}

async function countVisitsForProperty(propertyCode: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM events
    WHERE type = 'VISITA_EVALUADA'
      AND payload->>'propertyCode' = ${propertyCode}
  `;
  return rows[0]?.count ?? 0;
}

async function hasOfferForProperty(propertyCode: string): Promise<boolean> {
  const likePatterns = OFFER_KEYWORDS.map((kw) => `%${kw}%`);
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM events
    WHERE type = 'ESTADO_CAMBIADO'
      AND "aggregateId" = ${propertyCode}
      AND (
        lower(payload->>'newEstado') LIKE ANY(${likePatterns})
      )
  `;
  return (rows[0]?.count ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Scanner principal
// ---------------------------------------------------------------------------

export async function scanPropertiesForPricingReevaluation(): Promise<ReevaluationScanResult> {
  const result: ReevaluationScanResult = {
    propertiesScanned: 0,
    skippedByCooldown: 0,
    enqueuedNoLeads: 0,
    enqueuedVisitsNoOffer: 0,
    errors: [],
  };

  const properties = await prisma.propertyCurrent.findMany({
    where: { nodisponible: false },
    select: { codigo: true, fechaAlta: true, createdAt: true },
    take: MAX_PROPERTIES_PER_SCAN * 2,
  });

  result.propertiesScanned = properties.length;

  const cooldownSince = new Date(Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  const today = todayDateString();
  let enqueued = 0;

  for (const prop of properties) {
    if (enqueued >= MAX_PROPERTIES_PER_SCAN) break;

    try {
      if (await hasRecentAnalysis(prop.codigo, cooldownSince)) {
        result.skippedByCooldown++;
        continue;
      }

      let triggered: ReevalTrigger | null = null;

      // Trigger A: sin leads X días
      const ageDays = parsePropertyAge(prop.fechaAlta, prop.createdAt);
      if (ageDays >= DAYS_WITHOUT_LEADS) {
        const matchCount = await countMatchesForProperty(prop.codigo);
        if (matchCount === 0) {
          triggered = "no_leads_reeval";
        }
      }

      // Trigger B: visitas sin ofertas (evaluar incluso si Trigger A ya aplica)
      if (!triggered) {
        const visitCount = await countVisitsForProperty(prop.codigo);
        if (visitCount >= MIN_VISITS_WITHOUT_OFFER) {
          const hasOffer = await hasOfferForProperty(prop.codigo);
          if (!hasOffer) {
            triggered = "visits_no_offer_reeval";
          }
        }
      }

      if (!triggered) continue;

      await enqueueJob({
        type: "RUN_PRICING_ANALYSIS",
        payload: {
          propertyCode: prop.codigo,
          trigger: triggered,
          maxPages: REEVAL_MAX_PAGES,
          generateRecommendation: REEVAL_GENERATE_RECOMMENDATION,
        },
        availableAt: new Date(Date.now() + enqueued * STAGGER_MS),
        idempotencyKey: `pricing-reeval:${prop.codigo}:${today}`,
      });

      if (triggered === "no_leads_reeval") {
        result.enqueuedNoLeads++;
      } else {
        result.enqueuedVisitsNoOffer++;
      }
      enqueued++;
    } catch (err) {
      const msg = `${prop.codigo}: ${err instanceof Error ? err.message : String(err)}`;
      result.errors.push(msg);
      console.error(`[pricing-reeval] ${msg}`);
    }
  }

  console.log(
    `[pricing-reeval] scanned=${result.propertiesScanned} cooldown=${result.skippedByCooldown} ` +
      `noLeads=${result.enqueuedNoLeads} visitsNoOffer=${result.enqueuedVisitsNoOffer} ` +
      `errors=${result.errors.length}`,
  );

  return result;
}
