import type { OperacionEstado } from "@prisma/client";

/**
 * Orden canónico de las etapas activas (no terminales) de una operación.
 * Las etapas terminales (CERRADA_*, CANCELADA) no se incluyen porque no son
 * parte del pipeline progresivo — son desenlaces.
 */
export const OPERACION_STAGE_ORDER: readonly OperacionEstado[] = [
  "EN_CURSO",
  "OFERTA_FIRME",
  "RESERVA",
  "ARRAS",
  "PENDIENTE_FIRMA",
] as const;

export const CLOSED_ESTADOS: readonly OperacionEstado[] = [
  "CERRADA_VENTA",
  "CERRADA_ALQUILER",
  "CERRADA_TRASPASO",
] as const;

export type ClosedEstado = (typeof CLOSED_ESTADOS)[number];

// ---------------------------------------------------------------------------
// Helpers de posición y comparación
// ---------------------------------------------------------------------------

export function stageIndex(estado: OperacionEstado): number {
  return (OPERACION_STAGE_ORDER as readonly string[]).indexOf(estado);
}

export function isAdvance(
  from: OperacionEstado,
  to: OperacionEstado,
): boolean {
  const fi = stageIndex(from);
  const ti = stageIndex(to);
  if (fi === -1 || ti === -1) return false;
  return ti > fi;
}

/**
 * Retorna las etapas intermedias que se saltan al ir de `from` a `to`.
 * Útil para saber qué datos habría que validar cuando se hace un "force".
 */
export function skippedStages(
  from: OperacionEstado,
  to: OperacionEstado,
): OperacionEstado[] {
  const fi = stageIndex(from);
  const ti = stageIndex(to);
  if (fi === -1 || ti === -1 || ti <= fi) return [];
  return [...OPERACION_STAGE_ORDER.slice(fi + 1, ti)];
}

// ---------------------------------------------------------------------------
// Predicados de estado terminal
// ---------------------------------------------------------------------------

export function isClosedEstado(estado: OperacionEstado): boolean {
  return (CLOSED_ESTADOS as readonly string[]).includes(estado);
}

export function isCancelado(estado: OperacionEstado): boolean {
  return estado === "CANCELADA";
}

export function isTerminal(estado: OperacionEstado): boolean {
  return isClosedEstado(estado) || isCancelado(estado);
}

// ---------------------------------------------------------------------------
// Mapeo etapa → documentKind (plantilla de contrato)
// ---------------------------------------------------------------------------

export const STAGE_DOCUMENT_KIND: Partial<Record<OperacionEstado, string>> = {
  OFERTA_FIRME: "oferta_firme",
  RESERVA: "senal_compra",
  ARRAS: "arras",
};

export function documentKindForStage(
  estado: OperacionEstado,
): string | null {
  return STAGE_DOCUMENT_KIND[estado] ?? null;
}
