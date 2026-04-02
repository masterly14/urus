/**
 * M13 — Tipos del Control Financiero para el CEO Dashboard (Capa 6).
 *
 * Schema Zod para structured output de LangGraph + interfaces TypeScript.
 * El grafo recibe KPIs financieros, desglose de costes y datos de automatización,
 * y genera un análisis de control financiero con recomendaciones de reinversión.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Schema Zod — structured output para LangGraph
// ---------------------------------------------------------------------------

const AutomationRoiSchema = z.object({
  nombre: z
    .string()
    .describe("Nombre de la automatización (ej: 'Cadencia automática postventa')."),
  coste_mensual_eur: z
    .number()
    .describe("Coste mensual de la automatización en euros."),
  ahorro_mensual_eur: z
    .number()
    .describe("Ahorro mensual estimado en euros (horas ahorradas × coste hora)."),
  roi_percent: z
    .number()
    .describe("ROI porcentual: ((ahorro - coste) / coste) * 100."),
  comentario: z
    .string()
    .describe("Valoración breve del impacto de esta automatización (1 frase)."),
});

const ReinversionItemSchema = z.object({
  categoria: z
    .enum(["tecnologia", "equipo", "ciudad", "marketing", "formacion"])
    .describe("Categoría de reinversión recomendada."),
  importe_eur: z
    .number()
    .describe("Importe recomendado para reinvertir en esta categoría en euros."),
  justificacion: z
    .string()
    .describe("Justificación con datos de por qué reinvertir aquí (2-3 frases)."),
  prioridad: z
    .enum(["alta", "media", "baja"])
    .describe("Prioridad de esta reinversión en el contexto actual."),
  horizonte_meses: z
    .number()
    .describe("Horizonte temporal recomendado para ejecutar esta inversión en meses."),
});

export const CeoFinancialSchema = z.object({
  costes_fijos_eur: z
    .number()
    .describe("Costes fijos mensuales actuales en euros (sueldos, oficinas, licencias fijas)."),
  costes_variables_eur: z
    .number()
    .describe("Costes variables mensuales en euros (comisiones, marketing, servicios variables)."),
  coste_por_operacion_eur: z
    .number()
    .describe("Coste operativo total dividido entre el número de operaciones cerradas en el mes."),
  ratio_fijo_variable: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "Proporción de costes fijos sobre el total de costes (0-1). " +
        "Valor > 0.7 indica alta rigidez operativa.",
    ),
  automatizaciones: z
    .array(AutomationRoiSchema)
    .min(1)
    .max(10)
    .describe("Lista de automatizaciones activas con su ROI calculado."),
  roi_automatizaciones_total: z
    .number()
    .describe("ROI total ponderado de todas las automatizaciones en porcentaje."),
  capacidad_reinversion_eur: z
    .number()
    .describe(
      "Importe máximo seguro para reinvertir sin comprometer 3 meses de costes operativos.",
    ),
  recomendaciones: z
    .array(ReinversionItemSchema)
    .min(1)
    .max(5)
    .describe(
      "Recomendaciones de reinversión priorizadas por impacto, " +
        "distribuidas sobre la capacidad de reinversión disponible.",
    ),
  semaforo_financiero: z
    .enum(["verde", "amarillo", "rojo"])
    .describe(
      "Semáforo global de salud financiera: verde = EBITDA positivo y costes bajo control, " +
        "amarillo = presión sobre márgenes, rojo = pérdidas o cash crítico.",
    ),
  resumen_ejecutivo: z
    .string()
    .describe("Resumen de 2 frases dirigido al CEO: estado financiero y acción principal."),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confianza global del análisis (0-1). Baja si los datos del snapshot son incompletos."),
  reasoning: z
    .string()
    .describe("Razonamiento interno para auditoría y trazabilidad."),
});

// ---------------------------------------------------------------------------
// Tipos TypeScript derivados
// ---------------------------------------------------------------------------

export type CeoFinancialRecommendation = z.infer<typeof CeoFinancialSchema>;

export type AutomationRoi = z.infer<typeof AutomationRoiSchema>;

export type ReinversionItem = z.infer<typeof ReinversionItemSchema>;

export type SemaforoFinanciero = CeoFinancialRecommendation["semaforo_financiero"];

export type ReinversionCategoria = ReinversionItem["categoria"];
