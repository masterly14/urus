export { getInmovilla2FACode } from "./get-inmovilla-2fa-code";
export { createCalendarEvent } from "./create-calendar-event";
export type {
  CalendarEventInput,
  CalendarEventResult,
} from "./create-calendar-event";

// --- Calendar API directa multi-tenant (visit scheduling) ---
// H30: se eliminó `getFreeBusyWithAgent` (fallback LLM no determinista que
// podía proponer slots sobre bloques ocupados → riesgo de doble reserva).
export {
  getFreeBusy,
  createCalendarEventDirect,
  cancelCalendarEvent,
  checkCalendarHealth,
} from "./calendar";
export type { DirectCalendarEventInput } from "./calendar";
