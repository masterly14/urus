/**
 * M7 — Grafo LangGraph: análisis estadístico de pricing → diagnóstico textual
 * + recomendaciones estratégicas (mantener / ajustar_precio / reposicionar).
 *
 * Recibe un PricingAnalysisResult completo y produce un PricingRecommendation
 * con structured output validado por Zod.
 */

import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { llm } from "./llm";
import { withRetry } from "./utils/retry";
import {
  PricingRecommendationSchema,
  type PricingRecommendation,
} from "@/lib/pricing/recommendation-types";
import type { PricingAnalysisResult } from "@/lib/pricing/types";

// ── LLM con output estructurado ───────────────────────────────────────────────

const llmStructured = llm.withStructuredOutput(PricingRecommendationSchema, {
  name: "generar_recomendacion_pricing",
});

// ── Estado del grafo ─────────────────────────────────────────────────────────

const PricingRecommendationState = Annotation.Root({
  input: Annotation<PricingAnalysisResult>,
  recommendation: Annotation<PricingRecommendation | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  error: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
});

type PricingRecommendationStateType =
  typeof PricingRecommendationState.State;

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres un asesor experto en pricing inmobiliario del mercado español.

Tu tarea es analizar los datos estadísticos de un inmueble comparado con su cluster de mercado y generar:
1. Un diagnóstico textual profesional que cite datos concretos.
2. Recomendaciones estratégicas accionables.

CONTEXTO:
- Precios en EUR, superficies en m².
- El "gap" es la diferencia porcentual entre el precio/m² del inmueble y la media del cluster.
- Gap positivo = inmueble más caro que la media; gap negativo = más barato.

REGLAS DE DECISIÓN:
- Semáforo VERDE (gap absoluto ≤5%): el inmueble está bien posicionado. Acción: "mantener". Recomendar monitoreo semanal.
- Semáforo AMARILLO (gap absoluto 5–12%): riesgo comercial moderado. Priorizar mejoras no-precio (fotografía profesional, home staging virtual, descripción optimizada). Si no es suficiente, ajuste ligero de precio. Acción: "ajustar_precio" o "reposicionar" según contexto.
- Semáforo ROJO (gap absoluto >12%): fuera de mercado. Acción: "ajustar_precio" con rango concreto, o "reposicionar" si además el inmueble lleva tiempo sin actividad.
- Si la señal temporal indica mercado "caliente" y el inmueble acumula muchos días en cartera con gap positivo, endurece la recomendación hacia ajuste o reposicionamiento.
- Si la señal temporal indica mercado "lento", evita sobrerreaccionar solo por tiempo en mercado: prioriza diferenciar producto y argumentario antes de proponer descuentos agresivos.

INSTRUCCIONES:
- El diagnóstico DEBE citar: gap%, precio medio/m² del cluster, número de comparables, y segmentación particular/profesional si está disponible.
- Si existe tendencia temporal, el diagnóstico DEBE integrarla explícitamente: edad del inmueble, ritmo medio de publicación de comparables y nivel de presión temporal.
- Las recomendaciones deben ser específicas y accionables: incluir cifras (rango de precio, % de ajuste).
- Siempre considerar alternativas más allá del precio: reposicionar anuncio, mejorar fotos, cambiar orden de imágenes, home staging, destacar extras como argumento comercial.
- Si el inmueble tiene extras superiores al cluster, usar como argumento para mantener o justificar un precio más alto.
- precioSugeridoMin/Max solo cuando la acción sea "ajustar_precio": calcular basándose en el precio medio/m² del cluster ×metros del inmueble, con un margen razonable.
- Si la acción es "mantener", precioSugeridoMin y precioSugeridoMax deben ser null.
- argumentosComerciales: listar extras y ventajas del inmueble frente al cluster.
- riesgos: listar peligros de mantener la posición actual (tiempo en mercado, pérdida de visibilidad, competencia con inmuebles reformados, etc.).

FORMATO:
- Diagnóstico: 2–4 frases en español, tono profesional, dirigido al comercial.
- Recomendaciones: 1–5 puntos claros y concisos en español.`;

// ── Serialización del análisis para el prompt ─────────────────────────────────

function serializeAnalysisForPrompt(analysis: PricingAnalysisResult): string {
  const { input, stats, comparables } = analysis;

  const extrasStr = Object.entries(input.extras)
    .filter(([, v]) => v === true || (typeof v === "string" && v))
    .map(([k, v]) => (typeof v === "boolean" ? k : `${k}: ${v}`))
    .join(", ") || "ninguno destacable";

  const top5 = comparables.slice(0, 5).map((c, i) => {
    const extras = Object.entries(c.extras)
      .filter(([, v]) => v === true)
      .map(([k]) => k)
      .join(", ");
    return `  ${i + 1}. ${c.precioM2} €/m² | ${c.precio.toLocaleString("es-ES")} € | ${c.metrosConstruidos}m² | ${c.advertiserType} | extras: ${extras || "—"}`;
  });

  return `INMUEBLE ANALIZADO:
- Código: ${input.propertyCode}
- Precio: ${input.precio.toLocaleString("es-ES")} € (${input.precioM2} €/m²)
- Superficie: ${input.metrosConstruidos} m²
- Habitaciones: ${input.habitaciones} | Baños: ${input.banyos}
- Ciudad: ${input.ciudad} | Zona: ${input.zona}
- Tipología: ${input.tipologiaNombre}
- Estado: ${input.estado}
- Extras: ${extrasStr}

ESTADÍSTICAS DEL CLUSTER (${stats.totalComparables} comparables):
- Precio medio/m²: ${stats.precioMedioM2} €/m²
- Mediana/m²: ${stats.precioMedianaM2} €/m²
- Rango: ${stats.precioMinM2}–${stats.precioMaxM2} €/m²
- Desviación estándar: ${stats.desviacionEstandar}
- Media particular: ${stats.precioMedioM2Particular ?? "N/A"} €/m²
- Media profesional: ${stats.precioMedioM2Profesional ?? "N/A"} €/m²
- Gap del inmueble vs cluster: ${stats.gapPorcentaje > 0 ? "+" : ""}${stats.gapPorcentaje}%
- Semáforo: ${stats.semaforo.toUpperCase()}

TOP ${top5.length} COMPARABLES:
${top5.join("\n")}

SEÑALES TEMPORALES:
- Resumen: ${analysis.trend?.summary ?? "No disponible"}
- Edad del inmueble: ${analysis.trend?.propertyAgeDays ?? "N/A"} días
- Última actualización: ${analysis.trend?.lastUpdatedDays ?? "N/A"} días
- Ritmo del mercado: ${analysis.trend?.marketTempo ?? "sin_datos"}
- Presión temporal: ${analysis.trend?.pressure ?? "sin_datos"}
- Media de días publicados en comparables: ${analysis.trend?.comparableAverageDaysPublished ?? "N/A"}
- Mediana de días publicados en comparables: ${analysis.trend?.comparableMedianDaysPublished ?? "N/A"}
- Comparables recientes (<=14d): ${analysis.trend ? `${Math.round((analysis.trend.freshComparablesShare ?? 0) * 100)}%` : "N/A"}
- Comparables estancados (>=45d): ${analysis.trend ? `${Math.round((analysis.trend.staleComparablesShare ?? 0) * 100)}%` : "N/A"}`;
}

// ── Recomendación fallback para sin_datos ─────────────────────────────────────

function buildFallbackRecommendation(
  analysis: PricingAnalysisResult,
): PricingRecommendation {
  return {
    accion: "mantener",
    diagnostico:
      `No se encontraron comparables suficientes en el mercado para el inmueble ${analysis.input.propertyCode} ` +
      `en ${analysis.input.ciudad} (${analysis.input.tipologiaNombre}). ` +
      `Sin datos de referencia, no es posible emitir un diagnóstico fiable de posicionamiento.`,
    recomendaciones: [
      "Verificar que Statefox rastrea esta ciudad y tipología con el token actual.",
      "Considerar ampliar el rango de búsqueda de comparables (metros ±25%, precio ±40%).",
      "Solicitar valoración manual basada en experiencia del comercial en la zona.",
    ],
    precioSugeridoMin: null,
    precioSugeridoMax: null,
    argumentosComerciales: [],
    riesgos: [
      "Sin datos de mercado, el precio actual podría estar desalineado sin que el comercial lo detecte.",
    ],
    confidence: 0.1,
    reasoning:
      "Fallback automático: semáforo sin_datos, no se invocó LLM por falta de comparables.",
  };
}

// ── Nodo de recomendación ─────────────────────────────────────────────────────

async function recommendNode(
  state: PricingRecommendationStateType,
): Promise<Partial<PricingRecommendationStateType>> {
  const analysis = state.input;

  if (analysis.stats.semaforo === "sin_datos") {
    return { recommendation: buildFallbackRecommendation(analysis) };
  }

  try {
    const userContent = serializeAnalysisForPrompt(analysis);

    const raw = await withRetry(() =>
      llmStructured.invoke([
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Analiza el siguiente inmueble y genera tu recomendación de pricing:\n\n${userContent}`,
        },
      ]),
    );

    const recommendation: PricingRecommendation = {
      accion: raw.accion,
      diagnostico: raw.diagnostico,
      recomendaciones: raw.recomendaciones,
      precioSugeridoMin: raw.precioSugeridoMin,
      precioSugeridoMax: raw.precioSugeridoMax,
      argumentosComerciales: raw.argumentosComerciales,
      riesgos: raw.riesgos,
      confidence: raw.confidence,
      reasoning: raw.reasoning,
    };

    return { recommendation };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `Error generando recomendación de pricing: ${msg}` };
  }
}

// ── Grafo compilado ───────────────────────────────────────────────────────────

export const pricingRecommendationGraph = new StateGraph(
  PricingRecommendationState,
)
  .addNode("recomendar", recommendNode)
  .addEdge(START, "recomendar")
  .addEdge("recomendar", END)
  .compile();

// ── Función de entrada pública ────────────────────────────────────────────────

export async function generatePricingRecommendation(
  analysis: PricingAnalysisResult,
): Promise<PricingRecommendation> {
  const result = await pricingRecommendationGraph.invoke({ input: analysis });

  if (result.error) {
    throw new Error(result.error);
  }

  if (!result.recommendation) {
    throw new Error(
      "El agente de pricing no produjo recomendación",
    );
  }

  return result.recommendation;
}
