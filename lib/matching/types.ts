/**
 * M5 — Tipos del módulo de cruce de demandas contra propiedades.
 *
 * El cruce evalúa cada demanda activa contra una propiedad nueva/modificada,
 * generando un score ponderado por criterio (zona, precio, tipología, metros, habitaciones).
 */

// ── Score por criterio individual ────────────────────────────────────────────

export interface CriterionScore {
  matched: boolean;
  score: number; // 0–1
  reason: string;
}

// ── Resultado detallado del cruce por demanda ────────────────────────────────

export interface MatchScore {
  zone: CriterionScore;
  price: CriterionScore;
  type: CriterionScore;
  size: CriterionScore;
  rooms: CriterionScore;
}

export interface MatchResult {
  demandId: string;
  demandRef: string;
  demandNombre: string;
  propertyId: string;
  propertyRef: string;
  totalScore: number; // 0–100
  matchScore: MatchScore;
  isMatch: boolean; // totalScore >= threshold
}

// ── Configuración del motor de cruce ─────────────────────────────────────────

export interface MatchWeights {
  zone: number;
  price: number;
  type: number;
  size: number;
  rooms: number;
}

export interface MatchConfig {
  weights: MatchWeights;
  minScoreThreshold: number; // 0–100, score mínimo para considerarse match
  priceTolerancePercent: number; // % de tolerancia sobre presupuesto
  sizeFallbackRangePercent: number; // % para rango de metros si la demanda no especifica
}

// ── Input para la función principal ──────────────────────────────────────────

export interface PropertyForMatching {
  codigo: string;
  ref: string;
  titulo: string;
  tipoOfer: string;
  precio: number;
  metrosConstruidos: number;
  habitaciones: number;
  ciudad: string;
  zona: string;
  /** Tipo de operación: "venta" | "alquiler". Vacío si no se conoce. */
  tipoOperacion?: string;
}

export interface DemandForMatching {
  codigo: string;
  ref: string;
  nombre: string;
  presupuestoMin: number;
  presupuestoMax: number;
  habitacionesMin: number;
  tipos: string; // comma/pipe-separated
  zonas: string; // comma/pipe-separated
  /**
   * Superficie solicitada (m²). Materializado en `DemandCurrent.metrosMin`/`metrosMax`
   * vía el evento `DEMANDA_ACTUALIZADA` (variables extraídas por NLU desde WhatsApp
   * del comprador). Undefined cuando la demanda aún no ha pasado por NLU o la
   * extracción no detectó valor.
   * Scoring: undefined se trata como "sin criterio" (neutral).
   */
  metrosMin?: number;
  metrosMax?: number;
  /**
   * Tipo de operación ("venta" | "alquiler"). Materializado en
   * `DemandCurrent.tipoOperacion`. Hoy prácticamente siempre undefined porque
   * el grafo NLU actual no lo extrae. Reservado para extensión futura.
   * Cuando tanto propiedad como demanda definen `tipoOperacion` y son
   * incompatibles, `operationMatches` retorna false.
   */
  tipoOperacion?: string;
}

export interface MatchDemandsResult {
  property: PropertyForMatching;
  totalDemands: number;
  /** Demandas descartadas por filtros duros antes del scoring. */
  filteredOut: number;
  matches: MatchResult[];
  executionMs: number;
}
