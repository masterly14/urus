import type { EventType } from "@prisma/client";

/**
 * Maps event types to the cache tags that must be invalidated when
 * that event is emitted.  Only events that affect cached data are listed.
 */
export const CACHE_INVALIDATION_MAP: Partial<Record<EventType, string[]>> = {
  OPERACION_CREADA:         ["platform-summary", "operaciones-list"],
  OPERACION_AVANZADA:       ["platform-summary", "operaciones-list"],
  OPERACION_CERRADA:        ["platform-summary", "operaciones-list", "ceo-overview", "dashboard-comerciales"],
  COMPRADOR_ASOCIADO:       ["operaciones-list"],

  DEMANDA_CREADA:           ["platform-summary", "demands-list"],
  DEMANDA_MODIFICADA:       ["platform-summary", "demands-list"],
  DEMANDA_ACTUALIZADA:      ["platform-summary", "demands-list"],
  DEMANDA_ESTADO_CAMBIADO:  ["platform-summary", "demands-list"],
  LEAD_INGESTADO:           ["platform-summary", "demands-list"],

  PRICING_ANALISIS_GENERADO:    ["pricing-report"],
  PRICING_RECOMENDACION_GENERADA: ["pricing-report"],
  PRICING_PRECIO_APLICADO:      ["pricing-properties", "pricing-report"],

  PROPIEDAD_CREADA:         ["pricing-properties"],
  PROPIEDAD_MODIFICADA:     ["pricing-properties"],

  VISITA_EVALUADA:          ["platform-summary", "dashboard-comerciales"],
  SELECCION_VALIDADA:       ["platform-summary"],

  COLABORADOR_SLA_BREACH:             ["colaboradores-dashboard"],
  COLABORADOR_RECOMENDACION_GENERADA: ["colaboradores-dashboard"],

  CEO_DIAGNOSTICO_GENERADO: ["ceo-overview"],
  CEO_EXPANSION_EVALUADA:   ["ceo-overview"],
  CEO_FINANZAS_GENERADA:    ["ceo-overview"],
};
