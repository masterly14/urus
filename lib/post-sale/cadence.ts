import type { JobType } from "@prisma/client";

const MS_DAY = 86_400_000;

/**
 * Fases de la cadencia post-venta (M9).
 *
 * Cada fase tiene un rango de días desde el cierre y un job type asociado.
 * El handler de OPERACION_CERRADA encola un job por cada step con
 * `availableAt = closedAt + delayMs`.
 *
 * Fases:
 *   1. D0      — Agradecimiento inmediato
 *   2. D3–D7   — Soporte / ¿todo bien?
 *   3. D10–D14 — Solicitud de reseña (Google Review)
 *   4. D21–D30 — Activación de referidos
 *   5. D90–D180 — Re-captación
 */

export type PostSalePhase =
  | "agradecimiento"
  | "soporte"
  | "resena"
  | "referidos"
  | "recaptacion";

export interface PostSaleCadenceStep {
  phase: PostSalePhase;
  label: string;
  delayMs: number;
  jobType: JobType;
}

export const POST_SALE_CADENCE: PostSaleCadenceStep[] = [
  {
    phase: "agradecimiento",
    label: "D0",
    delayMs: 0,
    jobType: "SEND_POST_SALE_MESSAGE",
  },
  {
    phase: "soporte",
    label: "D+5",
    delayMs: 5 * MS_DAY,
    jobType: "SEND_POST_SALE_MESSAGE",
  },
  {
    phase: "resena",
    label: "D+12",
    delayMs: 12 * MS_DAY,
    jobType: "SEND_REVIEW_REQUEST",
  },
  {
    phase: "referidos",
    label: "D+25",
    delayMs: 25 * MS_DAY,
    jobType: "SEND_REFERRAL_REQUEST",
  },
  {
    phase: "recaptacion",
    label: "D+120",
    delayMs: 120 * MS_DAY,
    jobType: "SEND_POST_SALE_MESSAGE",
  },
];

export function getPhaseLabel(phase: PostSalePhase): string {
  const labels: Record<PostSalePhase, string> = {
    agradecimiento: "Agradecimiento",
    soporte: "Soporte post-entrega",
    resena: "Petición de reseña",
    referidos: "Activación de referidos",
    recaptacion: "Re-captación",
  };
  return labels[phase];
}

export function getPhaseEtapa(phase: PostSalePhase): number {
  const etapas: Record<PostSalePhase, number> = {
    agradecimiento: 1,
    soporte: 2,
    resena: 3,
    referidos: 4,
    recaptacion: 5,
  };
  return etapas[phase];
}
