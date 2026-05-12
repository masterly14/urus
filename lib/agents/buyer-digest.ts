/**
 * Builder de digest del comprador.
 *
 * Genera un resumen compacto (~200 tokens máx) del perfil acumulado del comprador.
 * Se actualiza al final de cada turno. No requiere LLM — es una función
 * determinista basada en los datos disponibles.
 */

import type { DemandVariables, PropertyFeedbackItem } from "./types";

export interface BuyerDigestInput {
  demandVariables: DemandVariables;
  feedbackHistory: PropertyFeedbackItem[];
  turnCount: number;
  selectionCount: number;
}

export function buildBuyerDigest(input: BuyerDigestInput): string {
  const parts: string[] = [];

  // Presupuesto
  const { precioMin, precioMax } = input.demandVariables;
  if (precioMin != null || precioMax != null) {
    const min = precioMin != null ? `${(precioMin / 1000).toFixed(0)}k` : "?";
    const max = precioMax != null ? `${(precioMax / 1000).toFixed(0)}k` : "?";
    parts.push(`Presupuesto: ${min}–${max}€`);
  }

  // Ubicación
  const { ciudad, zonas } = input.demandVariables;
  if (ciudad || (zonas && zonas.length > 0)) {
    const loc = [ciudad, ...(zonas ?? [])].filter(Boolean).join(", ");
    parts.push(`Ubicación: ${loc}`);
  }

  // Tamaño
  const { metrosMin, metrosMax, habitacionesMin } = input.demandVariables;
  const sizeParts: string[] = [];
  if (metrosMin != null || metrosMax != null) {
    const mMin = metrosMin != null ? `${metrosMin}` : "?";
    const mMax = metrosMax != null ? `${metrosMax}` : "?";
    sizeParts.push(`${mMin}–${mMax}m²`);
  }
  if (habitacionesMin != null) {
    sizeParts.push(`≥${habitacionesMin} hab`);
  }
  if (sizeParts.length > 0) {
    parts.push(`Tamaño: ${sizeParts.join(", ")}`);
  }

  // Tipología
  const { tipos } = input.demandVariables;
  if (tipos && tipos.length > 0) {
    parts.push(`Tipo: ${tipos.join(", ")}`);
  }

  // Extras
  const { extras, extrasNoDeseados } = input.demandVariables;
  if (extras && extras.length > 0) {
    parts.push(`Quiere: ${extras.join(", ")}`);
  }
  if (extrasNoDeseados && extrasNoDeseados.length > 0) {
    parts.push(`No quiere: ${extrasNoDeseados.join(", ")}`);
  }

  // Feedback acumulado. Tras el refactor "Me encaja" (M6) el NLU solo modela
  // rechazos (`NO_ME_ENCAJA`): el interés positivo se captura por el botón
  // del micrositio y queda registrado en `MicrositeSelectionFeedback`, no aquí.
  // Por eso este resumen únicamente muestra el número de descartadas.
  if (input.feedbackHistory.length > 0) {
    const disliked = input.feedbackHistory.filter((f) => f.sentiment === "NO_ME_ENCAJA").length;
    if (disliked > 0) {
      parts.push(`Feedback NLU: ${disliked} descartadas`);
    }
  }

  // Actividad
  parts.push(`Turnos: ${input.turnCount}, Props vistas: ${input.selectionCount}`);

  return parts.join(" | ");
}
