import type { Event, EnqueueJobInput, EventType, JobType } from "@/types/domain";

export interface HandlerResult {
  success: boolean;
  followUpJobs?: EnqueueJobInput[];
  error?: string;
  /** Si true, el error es permanente y el job debe ir directo a DEAD_LETTER. */
  permanent?: boolean;
  scoredPayload?: Record<string, unknown>;
}

export type EventHandler = (event: Event) => Promise<HandlerResult>;

export interface ConsumerConfig {
  workerId: string;
  batchSize?: number;
  pollIntervalMs?: number;
  maxCycles?: number;
  types?: JobType[];
}

export interface ConsumerCycleResult {
  processed: number;
  failed: number;
  noWork: boolean;
}

export interface ConsumerLoopResult {
  totalProcessed: number;
  totalFailed: number;
  cycles: number;
}

export interface HandlerRegistryEntry {
  type: EventType;
  handler: EventHandler;
}

/**
 * Lista canónica de todos los tipos de job que el consumer sabe procesar.
 * Tanto el cron (`/api/cron/consumer`) como `scripts/run-consumer.ts`
 * deben importar esta constante para mantenerse sincronizados con los
 * handlers registrados en `job-handlers.ts`.
 */
export const ALL_CONSUMER_JOB_TYPES: JobType[] = [
  "PROCESS_EVENT",
  "NOTIFY_LEAD_WHATSAPP",
  "FOLLOW_UP_LEAD",
  "GENERATE_MICROSITE",
  "SEND_MICROSITE_TO_BUYER",
  "SEND_WHATSAPP_MATCH",
  "WRITE_TO_INMOVILLA",
  "GENERATE_CONTRACT_DRAFT",
  "NOTIFY_CONTRACT_DATA_INCOMPLETE",
  "SEND_SIGNATURE_REQUEST",
  "RUN_PRICING_ANALYSIS",
  "NOTIFY_PRICING_WHATSAPP",
  "SEND_POST_SALE_MESSAGE",
  "SEND_REVIEW_REQUEST",
  "SEND_REVIEW_REMINDER",
  "SEND_REFERRAL_REQUEST",
  "START_POSTVENTA_CADENCE",
  "SEND_POSTVENTA_MESSAGE",
  "SEND_POSTVENTA_FORM",
  "SCHEDULE_POSTVENTA_BIRTHDAY",
  "SCHEDULE_POSTVENTA_NAVIDAD",
  "SEND_DEV_EXERCISE_NUDGE",
  "VISIT_CHECK_COMMERCIAL_TIMEOUT",
  "VISIT_CHECK_BUYER_TIMEOUT",
  "VISIT_CREATE_CALENDAR_EVENT",
  "VISIT_CANCEL_CALENDAR_EVENT",
  "VISIT_CLEANUP_EXPIRED_LOCKS",
  "VISIT_CHECK_COMPOSIO_HEALTH",
  "NOTA_ENCARGO_RECORDATORIO",
  "NOTA_ENCARGO_CHECK_CONFIRMACION",
  "NOTA_ENCARGO_ENVIAR_FORMULARIO",
  "NOTA_ENCARGO_MATCHING_CHECK",
  "PARTE_VISITA_ENVIAR_FORMULARIO",
  "EVALUATE_DEMAND_COVERAGE",
  "REBUILD_MATCHES_FOR_DEMAND",
  "START_NLU_INITIAL_CONTACT",
  "MATCH_DEMAND_AGAINST_INTERNAL",
  "UPDATE_PROPERTY_STATUS_INMOVILLA",
  "IMPORT_STATEFOX_PORTAL_IMAGES",
  // Core de Mercado (Fases 3-4)
  "MARKET_NORMALIZE_BATCH",
  "MARKET_FETCH_DETAIL",
  "MARKET_RESOLVE_IDENTITY",
  "MARKET_RESOLVE_ADVERTISER",
  "MARKET_DIFF_AND_VERSION",
  "MARKET_REFRESH_SNAPSHOT",
  "MARKET_IMPORT_LISTING_IMAGES",
  "MARKET_PUSH_ADVERTISER_TO_INMOVILLA",
  "TRANSFER_PROPERTY_AGENT",
];

/**
 * Subconjunto Market de post-crawl.
 *
 * Nota: `MARKET_CRAWL_SEED` no aparece aquí porque lo drena exclusivamente
 * `runCrawlTick` (scheduler market + Market Worker HTTP).
 */
export const MARKET_CONSUMER_JOB_TYPES: JobType[] = [
  "MARKET_NORMALIZE_BATCH",
  "MARKET_FETCH_DETAIL",
  "MARKET_RESOLVE_IDENTITY",
  "MARKET_RESOLVE_ADVERTISER",
  "MARKET_DIFF_AND_VERSION",
  "MARKET_REFRESH_SNAPSHOT",
  "MARKET_IMPORT_LISTING_IMAGES",
  "MARKET_PUSH_ADVERTISER_TO_INMOVILLA",
];

/**
 * Subconjunto de tipos que procesa el consumer dedicado en Railway (24/7).
 *
 * Excluye solo los tipos que tienen worker o cron especializado y que NO
 * deben drenarse desde el consumer generico:
 *  - `IMPORT_STATEFOX_PORTAL_IMAGES`: gestionado por el `image-worker` Railway
 *    (ver `docs/image-worker-railway.md`).
 *
 * Los `MARKET_*` de post-crawl ahora tienen consumer dedicado
 * (`consumer:market`) para aislar throughput y evitar starvation de jobs de
 * negocio general.
 *
 * El cron QStash de Vercel (`/api/cron/consumer`) sigue tomando todos los
 * tipos con `ALL_CONSUMER_JOB_TYPES` como red de seguridad: incluso si el
 * proceso Railway se cae, los jobs excluidos los siguen procesando sus
 * workers/crons especializados.
 */
const RAILWAY_EXCLUDED_TYPES: readonly JobType[] = [
  "IMPORT_STATEFOX_PORTAL_IMAGES",
  ...MARKET_CONSUMER_JOB_TYPES,
];
const RAILWAY_EXCLUDED_PREFIXES: readonly string[] = [];

export const RAILWAY_CONSUMER_JOB_TYPES: JobType[] = ALL_CONSUMER_JOB_TYPES.filter(
  (t) =>
    !RAILWAY_EXCLUDED_TYPES.includes(t) &&
    !RAILWAY_EXCLUDED_PREFIXES.some((prefix) => t.startsWith(prefix)),
);
