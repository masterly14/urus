/**
 * Segmento de URL reservado para previsualizar micro-frontends sin BD ni APIs reales.
 * Ej.: /agenda/demo, /post-visita/demo, /validar-seleccion/demo (y /seleccion/demo).
 */
export const DEMO_UI_ROUTE_SEGMENT = "demo";

export function isDemoUiRouteSegment(value: string): boolean {
  return value === DEMO_UI_ROUTE_SEGMENT;
}

/**
 * Misma regla que el microsite de selección: desarrollo siempre, o
 * NEXT_PUBLIC_MICROSITE_MOCK=true para staging/demos.
 */
export function isDemoUiEnabled(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  return process.env.NEXT_PUBLIC_MICROSITE_MOCK === "true";
}
