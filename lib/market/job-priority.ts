/**
 * Prioridades canónicas para el pipeline Market.
 *
 * Regla global de job_queue: menor número = mayor prioridad.
 * Estas constantes evitan regresiones semánticas (p.ej. usar Math.max por
 * accidente y volver "urgente" en "lento").
 */

/** Recrawl on-demand disparado por pricing/microsite con falta de inventario. */
export const MARKET_PRIORITY_CRAWL_ON_DEMAND = 10;

/** Normalize inmediato tras crawl completado (handoff crítico). */
export const MARKET_PRIORITY_NORMALIZE_ON_DEMAND = 20;

/** Follow-ups de resolución y detalle de listing. */
export const MARKET_PRIORITY_FOLLOW_UP = 30;

/** Tareas periódicas o de mantenimiento no urgentes. */
export const MARKET_PRIORITY_BACKGROUND = 100;

/**
 * Devuelve una prioridad urgente efectiva respetando un posible seed aún más
 * urgente (número menor).
 */
export function effectiveUrgentPriority(seedPriority: number): number {
  return Math.min(seedPriority, MARKET_PRIORITY_CRAWL_ON_DEMAND);
}
