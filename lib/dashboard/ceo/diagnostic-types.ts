/**
 * M13 — Tipos del Motor de Diagnóstico IA para el CEO Dashboard (Capa 4).
 *
 * Schema Zod para structured output de LangGraph + interfaces TypeScript.
 * El grafo recibe datos consolidados de Capas 1+2, Dashboard Comercial,
 * Alertas y Colaboradores, y produce CeoDiagnosticRecommendation con
 * recomendaciones estratégicas justificadas con datos.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Schema Zod — structured output para LangGraph
// ---------------------------------------------------------------------------

const CeoDiagnosticItemSchema = z.object({
  tipo: z
    .enum([
      "contratar",
      "expandir",
      "intervenir_proceso",
      "redistribuir_leads",
      "formacion",
      "ajustar_incentivos",
      "reducir_costes",
      "investigar",
    ])
    .describe(
      "Tipo de recomendación: " +
        "contratar = necesidad de incorporar nuevos comerciales; " +
        "expandir = oportunidad de abrir/crecer en un mercado; " +
        "intervenir_proceso = proceso comercial ineficiente que requiere corrección; " +
        "redistribuir_leads = reasignar leads entre comerciales/ciudades; " +
        "formacion = necesidad de capacitación para comerciales específicos; " +
        "ajustar_incentivos = modificar esquema de comisiones o bonus; " +
        "reducir_costes = optimizar gasto operativo; " +
        "investigar = datos insuficientes, requiere revisión manual.",
    ),
  ciudad: z
    .string()
    .nullable()
    .describe("Ciudad afectada (Córdoba, Málaga, Sevilla) o null si es global."),
  mensaje: z
    .string()
    .describe(
      "Explicación clara de la recomendación (1-3 frases), citando datos concretos.",
    ),
  datos_soporte: z
    .array(z.string())
    .describe(
      "Cifras concretas que respaldan la recomendación (ej: 'Facturación Málaga: 45.200€/mes', 'Carga media: 92%').",
    ),
  accion_sugerida: z
    .string()
    .describe("Acción concreta y ejecutable para el CEO."),
  impacto_esperado: z
    .string()
    .describe("Descripción del impacto positivo si se ejecuta la acción."),
  prioridad: z
    .enum(["alta", "media", "baja"])
    .describe("Prioridad de ejecución de esta recomendación."),
});

export const CeoDiagnosticSchema = z.object({
  diagnostico_general: z
    .string()
    .describe(
      "Evaluación global del estado de la empresa (3-5 frases). " +
        "Citar métricas concretas: facturación, EBITDA, margen, estado por ciudad, equipo.",
    ),
  recomendaciones: z
    .array(CeoDiagnosticItemSchema)
    .min(1)
    .max(10)
    .describe(
      "Lista de 1-10 recomendaciones estratégicas ordenadas por prioridad.",
    ),
  resumen_ejecutivo: z
    .string()
    .describe(
      "Resumen de 2 frases dirigido al CEO: estado general y acción más urgente.",
    ),
  semaforo_global: z
    .enum(["verde", "amarillo", "rojo"])
    .describe(
      "Semáforo global de la empresa: verde = buena salud, amarillo = atención necesaria, rojo = intervención urgente.",
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confianza global del diagnóstico (0-1)."),
  reasoning: z
    .string()
    .describe("Razonamiento interno breve para auditoría y trazabilidad."),
});

// ---------------------------------------------------------------------------
// Tipos TypeScript derivados
// ---------------------------------------------------------------------------

export type CeoDiagnosticRecommendation = z.infer<typeof CeoDiagnosticSchema>;

export type CeoDiagnosticItem = z.infer<typeof CeoDiagnosticItemSchema>;

export type CeoDiagnosticTipo = CeoDiagnosticItem["tipo"];

export type CeoDiagnosticPrioridad = CeoDiagnosticItem["prioridad"];

export type CeoDiagnosticSemaforo = CeoDiagnosticRecommendation["semaforo_global"];
