/**
 * M11 — Tipos del Motor de Recomendación IA para Colaboradores Externos.
 *
 * Schema Zod para structured output de LangGraph + interfaces TypeScript.
 * El grafo recibe DashboardColaboradoresPayload y produce ColaboradoresRecommendation
 * con recomendaciones estratégicas a nivel flota.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Schema Zod — structured output para LangGraph
// ---------------------------------------------------------------------------

const RecomendacionItemSchema = z.object({
  tipo: z
    .enum(["concentrar", "reducir", "alertar", "reconocer", "investigar"])
    .describe(
      "Tipo de recomendación: " +
        "concentrar = redirigir volumen de operaciones hacia partners estratégicos; " +
        "reducir = quitar carga operativa a colaboradores lentos; " +
        "alertar = intervención urgente en colaboradores críticos; " +
        "reconocer = destacar rendimiento sobresaliente; " +
        "investigar = revisar colaboradores con datos insuficientes.",
    ),
  mensaje: z
    .string()
    .describe(
      "Explicación clara de la recomendación (1-2 frases), citando datos concretos.",
    ),
  colaboradores_afectados: z
    .array(z.string())
    .describe(
      "Nombres de los colaboradores relevantes para esta recomendación. " +
        "Vacío si aplica a un grupo genérico.",
    ),
  accion_sugerida: z
    .string()
    .describe(
      "Acción concreta y ejecutable para el jefe de equipo o CEO.",
    ),
  impacto_esperado: z
    .string()
    .describe(
      "Descripción del impacto positivo si se ejecuta la acción.",
    ),
  prioridad: z
    .enum(["alta", "media", "baja"])
    .describe("Prioridad de ejecución de esta recomendación."),
});

export const ColaboradoresRecommendationSchema = z.object({
  diagnostico: z
    .string()
    .describe(
      "Evaluación global del ecosistema de colaboradores (2-4 frases). " +
        "Citar métricas concretas: SLA global, número de partners vs críticos, facturación total vinculada.",
    ),
  recomendaciones: z
    .array(RecomendacionItemSchema)
    .min(1)
    .max(8)
    .describe(
      "Lista de 1-8 recomendaciones estratégicas ordenadas por prioridad.",
    ),
  resumen_ejecutivo: z
    .string()
    .describe(
      "Resumen de 1-2 frases dirigido al CEO: estado de la flota y acción más urgente.",
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confianza global de las recomendaciones (0-1)."),
  reasoning: z
    .string()
    .describe("Razonamiento interno breve para auditoría y trazabilidad."),
});

// ---------------------------------------------------------------------------
// Tipos TypeScript derivados
// ---------------------------------------------------------------------------

export type ColaboradoresRecommendation = z.infer<
  typeof ColaboradoresRecommendationSchema
>;

export type RecomendacionItem = z.infer<typeof RecomendacionItemSchema>;

export type RecomendacionTipo = RecomendacionItem["tipo"];

export type RecomendacionPrioridad = RecomendacionItem["prioridad"];
