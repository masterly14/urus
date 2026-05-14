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
  "NOTIFY_MICROSITE_PENDING_VALIDATION",
  "SEND_MICROSITE_TO_BUYER",
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
];
