/**
 * Tipos del Motor de Recomendación IA (M7 — Pricing).
 *
 * Schema Zod para structured output de LangGraph + interfaces TypeScript.
 * El grafo recibe PricingAnalysisResult y produce PricingRecommendation.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Schema Zod — structured output para LangGraph
// ---------------------------------------------------------------------------

export const PricingRecommendationSchema = z.object({
  accion: z
    .enum(["mantener", "ajustar_precio", "reposicionar"])
    .describe(
      "Acción estratégica principal: " +
        "mantener = precio y posición actuales son competitivos; " +
        "ajustar_precio = necesita corrección de precio para competir; " +
        "reposicionar = retirar/relanzar o cambios profundos de presentación.",
    ),
  diagnostico: z
    .string()
    .describe(
      "Diagnóstico textual profesional (2–4 frases) citando datos concretos del análisis: " +
        "gap%, precio medio del cluster, número de comparables, segmentación particular/profesional.",
    ),
  recomendaciones: z
    .array(z.string())
    .min(1)
    .max(5)
    .describe(
      "Lista de 1–5 recomendaciones estratégicas accionables y específicas. " +
        "Incluir alternativas más allá del precio (fotos, home staging, reposición en portales).",
    ),
  precioSugeridoMin: z
    .number()
    .nullable()
    .describe(
      "Límite inferior del rango de precio sugerido en EUR. " +
        "null si acción es 'mantener' o no procede ajuste numérico.",
    ),
  precioSugeridoMax: z
    .number()
    .nullable()
    .describe(
      "Límite superior del rango de precio sugerido en EUR. " +
        "null si acción es 'mantener' o no procede ajuste numérico.",
    ),
  argumentosComerciales: z
    .array(z.string())
    .describe(
      "Puntos fuertes del inmueble frente al cluster (extras, ubicación, estado). " +
        "Vacío si no hay ventajas identificables.",
    ),
  riesgos: z
    .array(z.string())
    .describe(
      "Riesgos de mantener la posición actual (pérdida de visibilidad, tiempo en mercado, etc.). " +
        "Vacío si el inmueble está bien posicionado.",
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confianza global de la recomendación (0–1)."),
  reasoning: z
    .string()
    .describe("Razonamiento interno breve para auditoría y trazabilidad."),
});

// ---------------------------------------------------------------------------
// Tipos TypeScript derivados
// ---------------------------------------------------------------------------

export type PricingRecommendation = z.infer<typeof PricingRecommendationSchema>;

export type PricingAction = PricingRecommendation["accion"];
