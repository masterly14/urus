/**
 * M12 — Programas de Desarrollo Continuo: tipos, constantes y rotación temática.
 *
 * Ciclo de 4 semanas que rota entre los 4 ejes de desarrollo:
 *   Semana 0: Mentalidad Alto Ticket
 *   Semana 1: Gestión del Rechazo
 *   Semana 2: Identidad Closer
 *   Semana 3: Disciplina Emocional
 */

const MS_DAY = 86_400_000;
const MS_WEEK = 7 * MS_DAY;

export interface DevTheme {
  id: string;
  label: string;
  description: string;
}

export const DEV_THEMES: readonly DevTheme[] = [
  {
    id: "alto_ticket",
    label: "Mentalidad Alto Ticket",
    description:
      "Superar la barrera psicológica con precios altos, hablar de dinero con naturalidad, anclar valor antes de precio.",
  },
  {
    id: "gestion_rechazo",
    label: "Gestión del Rechazo",
    description:
      "Reencuadrar el 'no', separar el rechazo personal del profesional, resiliencia operativa.",
  },
  {
    id: "identidad_closer",
    label: "Identidad Closer",
    description:
      "Autoconcepto como cerrador, rituales pre-cierre, hábitos de alto rendimiento, narrativa interna.",
  },
  {
    id: "disciplina_emocional",
    label: "Disciplina Emocional",
    description:
      "Regulación emocional, no reaccionar en caliente, mantener nivel en días malos, consistencia.",
  },
] as const;

export const THEME_COUNT = DEV_THEMES.length;

/**
 * Devuelve el número de semana absoluto desde la fecha de referencia.
 * La semana empieza en lunes.
 */
export function getWeekNumber(now: Date, referenceDate: Date): number {
  const diffMs = now.getTime() - referenceDate.getTime();
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / MS_WEEK);
}

/**
 * Devuelve el tema de la semana según el weekNumber (ciclo de 4).
 */
export function getThemeForWeek(weekNumber: number): DevTheme {
  const index = ((weekNumber % THEME_COUNT) + THEME_COUNT) % THEME_COUNT;
  return DEV_THEMES[index];
}

/**
 * Devuelve el día de la semana (1=Lunes … 5=Viernes, 6=Sábado, 7=Domingo).
 * Usa convención ISO (lunes=1).
 */
export function getIsoDayOfWeek(date: Date): number {
  const jsDay = date.getDay();
  return jsDay === 0 ? 7 : jsDay;
}

/**
 * true si es día laborable (L-V).
 */
export function isWorkday(date: Date): boolean {
  return getIsoDayOfWeek(date) <= 5;
}

/**
 * true si es lunes.
 */
export function isMonday(date: Date): boolean {
  return getIsoDayOfWeek(date) === 1;
}

/**
 * Fecha de referencia para la rotación. Configurable vía env var,
 * default: 2026-04-06 (primer lunes del programa).
 */
export function getReferenceDate(): Date {
  const envDate = process.env.DEV_PROGRAM_REFERENCE_DATE;
  if (envDate) {
    const parsed = new Date(envDate);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return new Date("2026-04-06T00:00:00Z");
}

export interface DevExerciseScheduleInput {
  comercialId: string;
  waId: string;
  theme: DevTheme;
  weekNumber: number;
  dayOfWeek: number;
  type: "DAILY" | "WEEKLY_CHALLENGE";
}

export interface DevExerciseCrmContext {
  nombreComercial: string;
  ciudad: string;
  cierresPendientesHoy: number;
  operacionPerdidaReciente: boolean;
  rachaPositiva: boolean;
}
