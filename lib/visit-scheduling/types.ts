import type { VisitSessionState } from "@prisma/client";

// ---------------------------------------------------------------------------
// Slots y disponibilidad
// ---------------------------------------------------------------------------

/** Bloque de tiempo genérico. */
export interface TimeSlot {
  start: Date;
  end: Date;
}

/** Slot con label formateado para WhatsApp (ej: "Mar 15 Abr · 10:00–11:00"). */
export interface ProposedSlot extends TimeSlot {
  label: string;
}

/** Bloque ocupado devuelto por Google Calendar free/busy. */
export interface FreeBusyBlock {
  start: string;
  end: string;
}

// ---------------------------------------------------------------------------
// Slot Finder
// ---------------------------------------------------------------------------

export interface SlotFinderInput {
  comercialId: string;
  composioConnectionId: string;
  propertyCode: string;
  /** Excluir locks de esta sesión (para re-fetch dentro de la misma negociación). */
  excludeSessionId?: string;
  /**
   * Slots que ya fueron rechazados en rondas anteriores y no deben volver
   * a proponerse al comercial. Se comparan por `slotStart` exacto.
   */
  excludeSlotStarts?: Date[];
}

export interface SlotFinderResult {
  available: ProposedSlot[];
  totalCandidates: number;
}

// ---------------------------------------------------------------------------
// Contexto de visita (datos necesarios para iniciar el flujo)
// ---------------------------------------------------------------------------

export interface VisitContext {
  demandId: string;
  propertyCode: string;
  buyerWaId: string;
  property: {
    ref: string;
    titulo: string;
    direccion: string;
    precio: number;
    ciudad: string;
    zona: string;
    habitaciones: number;
    metrosConstruidos: number;
  };
  comercial: {
    id: string;
    nombre: string;
    waId: string;
    composioConnectionId: string;
  };
}

// ---------------------------------------------------------------------------
// Datos del visitante (recolectados al final del flujo)
// ---------------------------------------------------------------------------

export interface VisitorData {
  name: string;
  phone: string;
  count?: number;
}

// ---------------------------------------------------------------------------
// Intenciones del clasificador NLU de visitas
// ---------------------------------------------------------------------------

export type VisitIntent =
  | "QUIERE_VISITAR"
  | "ACEPTA_HORARIO"
  | "RECHAZA_HORARIO"
  | "INDICA_PREFERENCIA"
  | "PROPORCIONA_DATOS"
  | "CANCELAR_VISITA"
  | "REPROGRAMAR_VISITA"
  | "AMBIGUO"
  | "NO_VISIT_RELATED";

export interface VisitIntentClassification {
  intent: VisitIntent;
  extractedDate?: string;
  extractedTime?: string;
  extractedName?: string;
  extractedPhone?: string;
  extractedCount?: number;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Resultado de Composio Calendar
// ---------------------------------------------------------------------------

export interface CalendarFreeBusyResult {
  success: boolean;
  busy: FreeBusyBlock[];
  error?: string;
}

export interface CalendarEventCreateResult {
  success: boolean;
  eventId?: string;
  link?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Errores tipados
// ---------------------------------------------------------------------------

export class SlotNoLongerAvailableError extends Error {
  constructor(sessionId: string, slotStart: Date) {
    super(
      `Slot ${slotStart.toISOString()} ya no está disponible para sesión ${sessionId}`,
    );
    this.name = "SlotNoLongerAvailableError";
  }
}

export class PropertyFullError extends Error {
  constructor(propertyCode: string, slotStart: Date) {
    super(
      `Propiedad ${propertyCode} ya tiene el máximo de visitas en ${slotStart.toISOString()}`,
    );
    this.name = "PropertyFullError";
  }
}

export class MaxActiveSessionsError extends Error {
  constructor(buyerWaId: string, max: number) {
    super(
      `Comprador ${buyerWaId} ya tiene ${max} sesiones de agendamiento activas`,
    );
    this.name = "MaxActiveSessionsError";
  }
}

export class InvalidStateTransitionError extends Error {
  constructor(
    sessionId: string,
    from: VisitSessionState,
    to: VisitSessionState,
  ) {
    super(
      `Transición inválida de ${from} → ${to} en sesión ${sessionId}`,
    );
    this.name = "InvalidStateTransitionError";
  }
}

export class ComposioNotConnectedError extends Error {
  constructor(comercialId: string) {
    super(
      `Comercial ${comercialId} no tiene conexión Composio activa`,
    );
    this.name = "ComposioNotConnectedError";
  }
}

// ---------------------------------------------------------------------------
// Payload de eventos de visita (para tipado fuerte del Event Store)
// ---------------------------------------------------------------------------

export interface VisitaSolicitadaPayload {
  sessionId: string;
  demandId: string;
  propertyCode: string;
  comercialId: string;
  buyerWaId: string;
}

export interface VisitaSlotsPropuestosPayload {
  sessionId: string;
  round: number;
  slots: { start: string; end: string; label: string }[];
  comercialWaId: string;
}

export interface VisitaSlotSeleccionadoPayload {
  sessionId: string;
  selectedSlotStart: string;
  selectedSlotEnd: string;
  selectedByComercialId: string;
}

export interface VisitaPropuestaEnviadaPayload {
  sessionId: string;
  slotStart: string;
  slotEnd: string;
  buyerWaId: string;
}

export interface VisitaCompradorAceptoPayload {
  sessionId: string;
  slotStart: string;
  slotEnd: string;
}

export interface VisitaCompradorRechazoPayload {
  sessionId: string;
  round: number;
  slotStart: string;
  slotEnd: string;
  reason?: string;
}

export interface VisitaDatosRecopiladosPayload {
  sessionId: string;
  visitorName: string;
  visitorPhone: string;
  visitorCount?: number;
}

export interface VisitaAgendadaPayload {
  /** null when emitted from API /api/agenda (manual scheduling) */
  sessionId: string | null;
  comercialId: string;
  comercialNombre: string;
  demandId: string;
  propertyCode: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  visitorName: string;
  visitorPhone: string;
  visitorCount?: number;
  calendarEventId?: string | null;
  calendarLink?: string | null;
  calendarSuccess: boolean;
}

export interface VisitaEscaladaManualPayload {
  sessionId: string;
  reason: string;
  roundsAttempted: number;
  comercialId: string;
  buyerWaId: string;
  propertyCode: string;
  slotsAttempted?: { start: string; end: string }[];
  buyerPreferredDate?: string;
}

export interface VisitaCanceladaPayload {
  sessionId: string;
  cancelledBy: "buyer" | "commercial" | "system";
  calendarEventId?: string;
}

export interface VisitaReprogramadaPayload {
  sessionId: string;
  requestedBy: "buyer" | "commercial";
  originalSlotStart: string;
  originalSlotEnd: string;
  calendarEventId?: string;
}
