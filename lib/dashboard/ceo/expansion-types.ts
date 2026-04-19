/**
 * M13 — Tipos del Motor de Expansión Geográfica para el CEO Dashboard (Capa 5).
 *
 * Schema Zod para structured output de LangGraph + interfaces TypeScript.
 * El grafo recibe datos financieros, operativos y de equipo, evalúa criterios
 * de readiness y sugiere ciudades candidatas para expansión.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Schema Zod — structured output para LangGraph
// ---------------------------------------------------------------------------

const CriterioExpansionSchema = z.object({
  nombre: z
    .string()
    .describe("Nombre del criterio evaluado (ej: 'Facturación estable', 'Cash disponible')."),
  estado: z
    .enum(["cumplido", "parcial", "no_cumplido"])
    .describe(
      "Estado del criterio: cumplido = supera el umbral, parcial = cerca del umbral, no_cumplido = por debajo.",
    ),
  valor_actual: z
    .string()
    .describe("Valor actual del criterio con unidades (ej: '52.000 €', '18,5%')."),
  umbral: z
    .string()
    .describe("Umbral requerido con unidades (ej: '≥ 50.000 €', '≥ 15%')."),
  comentario: z
    .string()
    .describe("Explicación breve de la evaluación (1 frase)."),
});

const CiudadCandidataSchema = z.object({
  ciudad: z
    .string()
    .describe("Nombre de la ciudad candidata para expansión."),
  puntuacion: z
    .number()
    .min(1)
    .max(10)
    .describe("Puntuación de idoneidad de 1 a 10."),
  justificacion: z
    .string()
    .describe("Justificación de por qué esta ciudad es candidata (2-3 frases)."),
  inversion_estimada_eur: z
    .number()
    .describe("Inversión estimada en euros para abrir en esta ciudad."),
  break_even_meses: z
    .number()
    .describe("Meses estimados hasta alcanzar el break-even."),
  comerciales_iniciales: z
    .number()
    .describe("Número de comerciales recomendados para el arranque."),
  riesgos: z
    .array(z.string())
    .describe("Principales riesgos de expandirse a esta ciudad (1-3 items)."),
});

export const CeoExpansionSchema = z.object({
  readiness_global: z
    .enum(["apto", "parcial", "no_apto"])
    .describe(
      "Evaluación global de readiness: apto = >= 4 criterios cumplidos, " +
        "parcial = 3 criterios, no_apto = < 3 criterios.",
    ),
  criterios_evaluados: z
    .array(CriterioExpansionSchema)
    .min(3)
    .max(7)
    .describe("Lista de criterios evaluados con su estado actual."),
  ciudades_recomendadas: z
    .array(CiudadCandidataSchema)
    .min(0)
    .max(5)
    .describe(
      "Ciudades candidatas para expansión, ordenadas por puntuación. " +
        "Vacío si readiness es no_apto.",
    ),
  plan_expansion: z
    .string()
    .describe(
      "Plan de expansión concreto (2-4 frases) o 'No se recomienda expansión en este momento' si no_apto.",
    ),
  resumen_ejecutivo: z
    .string()
    .describe("Resumen de 2 frases dirigido al CEO: estado de readiness y acción principal."),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confianza global de la evaluación (0-1)."),
  reasoning: z
    .string()
    .describe("Razonamiento interno breve para auditoría y trazabilidad."),
});

// ---------------------------------------------------------------------------
// Tipos TypeScript derivados
// ---------------------------------------------------------------------------

export type CeoExpansionRecommendation = z.infer<typeof CeoExpansionSchema>;

export type CriterioExpansion = z.infer<typeof CriterioExpansionSchema>;

export type CiudadCandidata = z.infer<typeof CiudadCandidataSchema>;

export type ExpansionReadiness = CeoExpansionRecommendation["readiness_global"];

export type CriterioEstado = CriterioExpansion["estado"];
