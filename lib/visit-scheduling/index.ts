/**
 * Módulo de agendamiento de visitas (M4 — rediseño).
 *
 * Flujo 100% WhatsApp: Comprador ↔ Agente LangGraph ↔ Comercial.
 * Consulta de calendario via Composio multi-tenant, negociación acotada
 * con TTL, soft-locks de concurrencia y propiedad como recurso limitado.
 *
 * Diseño detallado: docs/visit-scheduling-system.md
 * Plan de implementación: docs/visit-scheduling-impl-plan.md
 */

// --- Constantes ---
export {
  WORKING_HOURS,
  VISIT_DURATION_MIN,
  BUFFER_BETWEEN_VISITS_MIN,
  MAX_ROUNDS,
  COMMERCIAL_RESPONSE_TTL_MS,
  BUYER_RESPONSE_TTL_MS,
  BUYER_PREFERENCE_TTL_MS,
  SLOT_LOCK_TTL_MS,
  LOOKAHEAD_BUSINESS_DAYS,
  MAX_SLOTS_TO_PROPOSE,
  MAX_CONCURRENT_VISITS_PER_PROPERTY,
  MAX_ACTIVE_SESSIONS_PER_BUYER,
  COMPOSIO_DIRECT_API_MAX_RETRIES,
  CALENDAR_EVENT_CREATE_MAX_RETRIES,
  VALID_TRANSITIONS,
  TERMINAL_STATES,
  BUYER_AWAITING_STATES,
  COMMERCIAL_AWAITING_STATES,
} from "./constants";

// --- Tipos ---
export type {
  TimeSlot,
  ProposedSlot,
  FreeBusyBlock,
  SlotFinderInput,
  SlotFinderResult,
  VisitContext,
  VisitorData,
  VisitIntent,
  VisitIntentClassification,
  CalendarFreeBusyResult,
  CalendarEventCreateResult,
  VisitaSolicitadaPayload,
  VisitaSlotsPropuestosPayload,
  VisitaSlotSeleccionadoPayload,
  VisitaPropuestaEnviadaPayload,
  VisitaCompradorAceptoPayload,
  VisitaCompradorRechazoPayload,
  VisitaDatosRecopiladosPayload,
  VisitaAgendadaPayload,
  VisitaEscaladaManualPayload,
  VisitaCanceladaPayload,
  VisitaReprogramadaPayload,
} from "./types";

export {
  SlotNoLongerAvailableError,
  PropertyFullError,
  MaxActiveSessionsError,
  InvalidStateTransitionError,
  ComposioNotConnectedError,
} from "./types";

// --- Slot Finder (motor de disponibilidad) ---
export {
  generateWorkingSlots,
  filterByCalendar,
  filterByLocks,
  filterByPropertyCapacity,
  selectTopSlots,
  formatSlotLabel,
  findAvailableSlots,
  findSpecificSlot,
} from "./slot-finder";

// --- Lock Manager ---
export {
  createSlotLocks,
  releaseLocksForSession,
  releaseLocksExcept,
  getActiveLocksForComercial,
  cleanupExpiredLocks,
  hasActiveLockForSlot,
} from "./lock-manager";

// --- Session Manager ---
export {
  createSession,
  getActiveSessionForBuyer,
  getActiveSessionForComercial,
  transitionState,
  incrementRound,
  setVisitorData,
  markCompleted,
  completeVisit,
  markEscalated,
  getSessionById,
  getExpiredSessions,
  getAllActiveSessionsForBuyer,
} from "./session-manager";
export type { TransitionData } from "./session-manager";

// --- Confirmación Atómica ---
export {
  confirmVisitAtomically,
  cancelVisitAtomically,
} from "./confirm-visit";
export type {
  ConfirmVisitInput,
  ConfirmVisitResult,
  CancelVisitResult,
} from "./confirm-visit";

// --- Orquestador principal (Bloque 6) ---
export {
  initiateVisitScheduling,
  fetchAndProposeSlots,
  handleCommercialSlotSelection,
  handleBuyerAcceptance,
  handleBuyerRejection,
  handleBuyerPreference,
  handleVisitorData,
  handleCommercialConfirmsBuyerPreference,
  handleCommercialRejectsBuyerPreference,
  handleEscalation,
  handleCancellation,
  handleRescheduling,
} from "./orchestrator";

// --- Router de mensajes de visita (Bloque 5) ---
export { handleVisitMessage } from "./handle-visit-message";
export type { HandleVisitMessageResult } from "./handle-visit-message";
