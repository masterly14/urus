/**
 * Detección universal de "operación cerrada" a partir del estado de Inmovilla.
 *
 * El Ingestion Worker detecta cambios de estado y emite ESTADO_CAMBIADO con
 * `previousEstado` / `newEstado` (strings textuales del enum `estadoficha`).
 * Esta función evalúa si el nuevo estado representa un cierre definitivo.
 *
 * Patrón idéntico a isSmartClosingTrigger (smart-closing-handler.ts):
 * comparación case-insensitive con `.includes()` para cubrir variantes.
 *
 * Keywords validados contra el catálogo real de Inmovilla (33 valores):
 *   GET /enums/?tipos=estadoficha — ejecutado con scripts/dump-estadoficha.ts
 *
 * Estados de cierre detectados (9 de 33):
 *   "vendid"   → Vendida(3), Vendida por Otros(11), Vendida MLS(14), Vendida Particular(21)
 *   "alquilad" → Alquilada(2), Alquilada por Otros(10), Alquilada MLS(13), Alquilada Particular(22)
 *   "traspaso" → Traspaso(6)
 *
 * Estados que NO son cierre (24 de 33):
 *   Libre(1), Señalizada(4), No Libre(5), Reservado(7), En Trámites(8),
 *   Sólo Seguimiento(9), Solo Publicar(12), Okupada(15), Alquiler Social(16),
 *   Tapiada(17), Ofertada(18), Contrato Arras(19), Fin de Encargo(20),
 *   Descartada(23), Es inmobiliaria(32), Sin Revisar(34), Fuera de Mercado(35),
 *   Descartado(36), Ya No Venden(37), Ya No Alquilan(38), Reservada MLS(40),
 *   Ofertada MLS(41), Pendiente de Firma(42), Fuera de Mercado(43)
 */

export const CLOSED_OPERATION_KEYWORDS = [
  "vendid",
  "alquilad",
  "traspaso",
] as const;

export function isClosedOperation(newEstado: string): boolean {
  const normalized = newEstado.toLowerCase();
  return CLOSED_OPERATION_KEYWORDS.some((kw) => normalized.includes(kw));
}
