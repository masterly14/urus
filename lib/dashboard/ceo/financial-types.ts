/**
 * M13 — Tipos del Control Financiero para el CEO Dashboard (Capa 6).
 *
 * Schema Zod para structured output de LangGraph + interfaces TypeScript.
 * El grafo recibe datos financieros reales + constantes de automatizaciones
 * y produce un análisis de costes, ROI de automatizaciones y recomendaciones
 * de reinversión priorizadas.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

const AutomationRoiSchema = z.object({
  nombre: z
    .string()
    .describe("Nombre de la automatización (ej: 'Cadencia postventa')."),
  coste_mensual_eur: z
    .number()
    .describe("Coste mensual en euros de mantener esta automatización."),
  ahorro_mensual_eur: z
    .number()
    .describe("Ahorro mensual estimado en euros que genera."),
  roi_percent: z
    .number()
    .describe("ROI porcentual = (ahorro - coste) / coste * 100."),
});

const ReinversionItemSchema = z.object({
  categoria: z
    .enum([
      "tecnologia",
      "talento",
      "marketing",
      "formacion",
      "infraestructura",
      "expansion",
    ])
    .describe("Categoría de la reinversión recomendada."),
  importe_eur: z
    .number()
    .describe("Importe recomendado en euros para esta partida."),
  justificacion: z
    .string()
    .describe("Justificación basada en datos reales (2-3 frases)."),
  prioridad: z
    .enum(["alta", "media", "baja"])
    .describe("Prioridad de la reinversión."),
  horizonte_meses: z
    .number()
    .int()
    .min(1)
    .max(24)
    .describe("Horizonte temporal en meses para ejecutar esta inversión."),
});

// ---------------------------------------------------------------------------
// Schema principal
// ---------------------------------------------------------------------------

export const CeoFinancialSchema = z.object({
  costes_fijos_eur: z
    .number()
    .describe("Costes fijos mensuales en euros (nóminas, alquiler, suscripciones)."),
  costes_variables_eur: z
    .number()
    .describe("Costes variables mensuales en euros (comisiones, marketing variable)."),
  coste_por_operacion_eur: z
    .number()
    .describe("Coste medio por operación cerrada = costeOperativo / operacionesCerradas."),
  ratio_fijo_variable: z
    .number()
    .min(0)
    .max(1)
    .describe("Ratio costes fijos / costes totales (0-1)."),
  automatizaciones: z
    .array(AutomationRoiSchema)
    .min(1)
    .max(10)
    .describe("Lista de automatizaciones con su ROI individual."),
  roi_automatizaciones_total: z
    .number()
    .describe("ROI promedio ponderado de todas las automatizaciones (%)."),
  capacidad_reinversion_eur: z
    .number()
    .describe("Capacidad de reinversión segura en euros."),
  recomendaciones: z
    .array(ReinversionItemSchema)
    .min(1)
    .max(8)
    .describe("Recomendaciones de reinversión priorizadas."),
  semaforo_financiero: z
    .enum(["verde", "amarillo", "rojo"])
    .describe(
      "Semáforo financiero: verde = ratio coste/revenue < 60%, " +
        "amarillo = < 80%, rojo = >= 80%.",
    ),
  resumen_ejecutivo: z
    .string()
    .describe("Resumen de 2 frases dirigido al CEO: situación financiera y acción principal."),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confianza global del análisis (0-1)."),
  reasoning: z
    .string()
    .describe("Razonamiento interno breve para auditoría y trazabilidad."),
});

// ---------------------------------------------------------------------------
// Tipos TypeScript derivados
// ---------------------------------------------------------------------------

export type CeoFinancialRecommendation = z.infer<typeof CeoFinancialSchema>;

export type AutomationRoi = z.infer<typeof AutomationRoiSchema>;

export type ReinversionItem = z.infer<typeof ReinversionItemSchema>;

export type SemaforoFinanciero = CeoFinancialRecommendation["semaforo_financiero"];

export type ReinversionCategoria = ReinversionItem["categoria"];
