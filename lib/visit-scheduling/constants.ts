import { VisitSessionState } from "@prisma/client";

// ---------------------------------------------------------------------------
// Horario laboral (España — L-S con jornada partida)
// ---------------------------------------------------------------------------

export interface WorkingBlock {
  start: string;
  end: string;
}

export const WORKING_HOURS = {
  /** ISO weekday: 1 = Lunes … 6 = Sábado. Domingo (0/7) excluido. */
  days: [1, 2, 3, 4, 5, 6] as readonly number[],
  blocks: [
    { start: "09:00", end: "14:00" },
    { start: "16:00", end: "20:00" },
  ] as readonly WorkingBlock[],
  timezone: "Europe/Madrid",
} as const;

// ---------------------------------------------------------------------------
// Duración y buffer
// ---------------------------------------------------------------------------

/** Duración de una visita en minutos. */
export const VISIT_DURATION_MIN = 60;

/** Buffer mínimo entre visitas del mismo comercial en minutos. */
export const BUFFER_BETWEEN_VISITS_MIN = 30;

// ---------------------------------------------------------------------------
// Rondas de negociación
// ---------------------------------------------------------------------------

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/** Máximo de rondas completas (comprador rechaza → nueva propuesta). */
export const MAX_ROUNDS = envInt("VISIT_MAX_ROUNDS", 3);

// ---------------------------------------------------------------------------
// TTLs (en milisegundos)
// ---------------------------------------------------------------------------

const HOURS = 3_600_000;

/** Tiempo que tiene el comercial para responder a una propuesta de slots. */
export const COMMERCIAL_RESPONSE_TTL_MS =
  envInt("VISIT_COMMERCIAL_TTL_HOURS", 2) * HOURS;

/** Tiempo que tiene el comprador para aceptar/rechazar el horario. */
export const BUYER_RESPONSE_TTL_MS =
  envInt("VISIT_BUYER_TTL_HOURS", 4) * HOURS;

/** Tiempo que tiene el comprador para indicar su preferencia de día/hora. */
export const BUYER_PREFERENCE_TTL_MS =
  envInt("VISIT_BUYER_PREF_TTL_HOURS", 6) * HOURS;

/** TTL del soft-lock de slots (alineado con el TTL del comercial). */
export const SLOT_LOCK_TTL_MS = COMMERCIAL_RESPONSE_TTL_MS;

// ---------------------------------------------------------------------------
// Búsqueda de disponibilidad
// ---------------------------------------------------------------------------

/** Días laborables hacia adelante para buscar slots. */
export const LOOKAHEAD_BUSINESS_DAYS =
  envInt("VISIT_LOOKAHEAD_BUSINESS_DAYS", 5);

/** Máximo de slots a proponer al comercial (WhatsApp reply buttons: máx 3). */
export const MAX_SLOTS_TO_PROPOSE = 3;

// ---------------------------------------------------------------------------
// Capacidad de propiedad
// ---------------------------------------------------------------------------

/** Visitas simultáneas por propiedad (1 = sin concurrencia). */
export const MAX_CONCURRENT_VISITS_PER_PROPERTY = 1;

// ---------------------------------------------------------------------------
// Sesiones activas por comprador
// ---------------------------------------------------------------------------

/** Máximo de sesiones de agendamiento activas simultáneas por comprador. */
export const MAX_ACTIVE_SESSIONS_PER_BUYER = 3;

// ---------------------------------------------------------------------------
// Composio fallback
// ---------------------------------------------------------------------------

/** Intentos con API directa de Composio antes de escalar a agente IA. */
export const COMPOSIO_DIRECT_API_MAX_RETRIES = 3;

// ---------------------------------------------------------------------------
// Reintentos de creación de evento calendario
// ---------------------------------------------------------------------------

/** Intentos de crear el evento en Google Calendar tras confirmación. */
export const CALENDAR_EVENT_CREATE_MAX_RETRIES = 3;

// ---------------------------------------------------------------------------
// State machine — transiciones válidas
// ---------------------------------------------------------------------------

type TransitionMap = Readonly<Record<VisitSessionState, readonly VisitSessionState[]>>;

export const VALID_TRANSITIONS: TransitionMap = {
  INITIATED: ["FETCHING_SLOTS", "ESCALATED_MANUAL"],
  FETCHING_SLOTS: ["SLOTS_PROPOSED_TO_COMMERCIAL", "ESCALATED_MANUAL", "ASKING_BUYER_PREFERENCE"],
  SLOTS_PROPOSED_TO_COMMERCIAL: ["COMMERCIAL_ACCEPTED_SLOT", "FETCHING_SLOTS", "ESCALATED_MANUAL"],
  COMMERCIAL_ACCEPTED_SLOT: ["SLOT_PROPOSED_TO_BUYER"],
  SLOT_PROPOSED_TO_BUYER: ["BUYER_ACCEPTED", "BUYER_REJECTED", "FETCHING_SLOTS", "ASKING_BUYER_PREFERENCE", "ESCALATED_MANUAL"],
  BUYER_ACCEPTED: ["COLLECTING_VISITOR_DATA"],
  BUYER_REJECTED: ["FETCHING_SLOTS", "ASKING_BUYER_PREFERENCE", "ESCALATED_MANUAL"],
  ASKING_BUYER_PREFERENCE: ["FETCHING_SPECIFIC_SLOT", "ESCALATED_MANUAL"],
  FETCHING_SPECIFIC_SLOT: ["SPECIFIC_SLOT_TO_COMMERCIAL", "ASKING_BUYER_PREFERENCE"],
  SPECIFIC_SLOT_TO_COMMERCIAL: ["BUYER_ACCEPTED", "ESCALATED_MANUAL"],
  COLLECTING_VISITOR_DATA: ["VISIT_CONFIRMED", "ESCALATED_MANUAL"],
  VISIT_CONFIRMED: ["VISIT_COMPLETED", "VISIT_CANCELLED", "VISIT_RESCHEDULED"],
  VISIT_COMPLETED: [],
  VISIT_CANCELLED: [],
  VISIT_RESCHEDULED: ["ESCALATED_MANUAL"],
  ESCALATED_MANUAL: [],
};

/** Estados terminales donde la sesión ya no acepta mensajes. */
export const TERMINAL_STATES: readonly VisitSessionState[] = [
  "VISIT_CONFIRMED",
  "VISIT_COMPLETED",
  "VISIT_CANCELLED",
  "ESCALATED_MANUAL",
];

/** Estados donde la sesión espera respuesta del comprador. */
export const BUYER_AWAITING_STATES: readonly VisitSessionState[] = [
  "SLOT_PROPOSED_TO_BUYER",
  "ASKING_BUYER_PREFERENCE",
  "COLLECTING_VISITOR_DATA",
];

/** Estados donde la sesión espera respuesta del comercial. */
export const COMMERCIAL_AWAITING_STATES: readonly VisitSessionState[] = [
  "SLOTS_PROPOSED_TO_COMMERCIAL",
  "SPECIFIC_SLOT_TO_COMMERCIAL",
];
