import type { OperacionEstado } from "@/app/generated/prisma/client";

/**
 * Mapea el texto de `estadoficha` de Inmovilla al enum `OperacionEstado` de Prisma.
 * Retorna `null` si el texto no corresponde a ningún estado conocido.
 */
export function mapEstadoFichaToOperacionEstado(
  estadoFicha: string,
): OperacionEstado | null {
  const lower = estadoFicha.toLowerCase();
  if (lower.includes("reserv") || lower.includes("señal") || lower.includes("senal"))
    return "RESERVA";
  if (lower.includes("arras")) return "ARRAS";
  if (lower.includes("pendiente") && lower.includes("firma"))
    return "PENDIENTE_FIRMA";
  if (lower.includes("vendid")) return "CERRADA_VENTA";
  if (lower.includes("alquilad")) return "CERRADA_ALQUILER";
  if (lower.includes("traspaso")) return "CERRADA_TRASPASO";
  return null;
}

const CLOSED_STATES: Set<OperacionEstado> = new Set([
  "CERRADA_VENTA",
  "CERRADA_ALQUILER",
  "CERRADA_TRASPASO",
  "CANCELADA",
]);

export function isEstadoCerrado(estado: OperacionEstado): boolean {
  return CLOSED_STATES.has(estado);
}
