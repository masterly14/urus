import type { OperacionEstado } from "@prisma/client";
import { isTerminal } from "./stages";

/**
 * Mapea el texto de `estadoficha` de Inmovilla al enum `OperacionEstado` de Prisma.
 * Retorna `null` si el texto no corresponde a ningún estado conocido.
 *
 * Catálogo de referencia (33 valores): docs/operacion-cerrada.md
 */
export function mapEstadoFichaToOperacionEstado(
  estadoFicha: string,
): OperacionEstado | null {
  const lower = estadoFicha.toLowerCase();
  if (lower.includes("ofertad")) return "OFERTA_FIRME";
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

/**
 * @deprecated Usar `isTerminal` de `lib/operacion/stages.ts` en su lugar.
 */
export function isEstadoCerrado(estado: OperacionEstado): boolean {
  return isTerminal(estado);
}
