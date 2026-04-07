/**
 * Grafo LangGraph para scoring de leads con IA.
 *
 * Analiza señales cualitativas que las reglas estáticas no capturan
 * (tono del mensaje, urgencia implícita, patrones de conversión históricos)
 * y produce ajustes a los sub-scores de Pclose, Value y Urgency.
 *
 * Convención del proyecto: Annotation.Root → StateGraph → nodo único → START/END.
 */

import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { z } from "zod";
import { llm } from "./llm";
import type { AIScoringGraphInput, AIScoringResult } from "@/lib/scoring/ai-types";

// ── Schema Zod ──────────────────────────────────────────────────────────────

const LeadScoringAISchema = z.object({
  pcloseAdjustment: z
    .number()
    .min(-30)
    .max(30)
    .describe(
      "Ajuste al sub-score Pclose (-30 a +30). Positivo si detectas señales de alta probabilidad de cierre no capturadas por las reglas.",
    ),
  valueAdjustment: z
    .number()
    .min(-30)
    .max(30)
    .describe(
      "Ajuste al sub-score Value (-30 a +30). Positivo si el lead tiene valor económico implícito alto.",
    ),
  urgencyAdjustment: z
    .number()
    .min(-30)
    .max(30)
    .describe(
      "Ajuste al sub-score Urgency (-30 a +30). Positivo si hay urgencia implícita no capturada.",
    ),
  qualitativeSignals: z
    .array(z.string())
    .describe("Lista de señales cualitativas detectadas en el mensaje o contexto del lead."),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confianza en los ajustes propuestos (0 = sin confianza, 1 = muy seguro)."),
  reasoning: z
    .string()
    .describe("Razonamiento breve que justifica los ajustes para auditoría."),
});

// ── Estado del grafo ────────────────────────────────────────────────────────

const LeadScoringState = Annotation.Root({
  input: Annotation<AIScoringGraphInput>,
  scoringResult: Annotation<AIScoringResult | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  error: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
});

type LeadScoringStateType = typeof LeadScoringState.State;

// ── LLM con output estructurado ─────────────────────────────────────────────

const llmStructured = llm.withStructuredOutput(LeadScoringAISchema, {
  name: "score_lead_ia",
});

// ── Prompt ───────────────────────────────────────────────────────────────────

function buildSystemPrompt(input: AIScoringGraphInput): string {
  const { currentWeights, historicalStats, ruleSubScores } = input;

  const statsBlock = [
    `Leads cerrados totales: ${historicalStats.totalClosedLeads}`,
    `Leads abiertos totales: ${historicalStats.totalOpenLeads}`,
    historicalStats.avgScoreClosedLeads != null
      ? `Score medio leads cerrados: ${historicalStats.avgScoreClosedLeads.toFixed(1)}`
      : null,
    historicalStats.avgScoreOpenLeads != null
      ? `Score medio leads no cerrados: ${historicalStats.avgScoreOpenLeads.toFixed(1)}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const cityConversion = Object.entries(historicalStats.conversionRateByCity)
    .map(([city, rate]) => `  ${city}: ${(rate * 100).toFixed(1)}%`)
    .join("\n");

  const sourceConversion = Object.entries(historicalStats.conversionRateBySource)
    .map(([source, rate]) => `  ${source}: ${(rate * 100).toFixed(1)}%`)
    .join("\n");

  return `Eres un analista experto en leads inmobiliarios del mercado español.

Tu tarea es analizar un lead y proponer AJUSTES cualitativos a los sub-scores que ya calcularon las reglas estáticas. No reemplazas el scoring por reglas: lo complementas detectando señales que los booleanos no capturan.

PESOS ACTUALES DEL MODELO (versión ${currentWeights.version ?? "base"}):
- Pclose: ${currentWeights.pclose} | Value: ${currentWeights.value} | Urgency: ${currentWeights.urgency}

SUB-SCORES CALCULADOS POR REGLAS (0-100):
- Pclose: ${ruleSubScores.pclose} | Value: ${ruleSubScores.value} | Urgency: ${ruleSubScores.urgency}

ESTADÍSTICAS HISTÓRICAS:
${statsBlock}

Conversión por ciudad:
${cityConversion || "  Sin datos suficientes"}

Conversión por origen:
${sourceConversion || "  Sin datos suficientes"}

INSTRUCCIONES:
1. Analiza el mensaje del lead (si existe) buscando: tono de urgencia, nivel de detalle, compromiso implícito, señales de "tire-kicker", indicadores de capacidad financiera.
2. Considera el contexto histórico: si la ciudad o el origen del lead tienen tasas de conversión significativamente distintas a la media, ajusta en consecuencia.
3. Los ajustes deben ser conservadores (-30 a +30 sobre 100). Un ajuste de ±10 es significativo.
4. Si no hay mensaje raw o el contexto es insuficiente, devuelve ajustes de 0 con confianza baja.
5. Las qualitativeSignals deben ser específicas y accionables para el comercial.`;
}

function buildUserMessage(input: AIScoringGraphInput): string {
  const { leadData, mensajeRaw, ciudad, source } = input;

  const parts = [
    `Tipo: ${leadData.tipo}`,
    `Ciudad: ${ciudad || "no especificada"}`,
    `Origen: ${source || "no especificado"}`,
  ];

  const signals: string[] = [];
  if (leadData.preaprobacionHipotecaria) signals.push("preaprobación hipotecaria");
  if (leadData.presupuestoDefinido) signals.push("presupuesto definido");
  if (leadData.referido) signals.push("referido");
  if (leadData.soloMirando) signals.push("solo mirando");
  if (leadData.mensajeConDetalles) signals.push("mensaje con detalles");
  if (leadData.urgenciaVenta) signals.push("urgencia de venta");
  if (leadData.exclusivaAceptable) signals.push("exclusiva aceptable");
  if (leadData.probarSinAgencia) signals.push("probar sin agencia");

  if (signals.length > 0) {
    parts.push(`Señales detectadas por reglas: ${signals.join(", ")}`);
  }

  if (typeof leadData.plazoDias === "number") {
    parts.push(`Plazo declarado: ${leadData.plazoDias} días`);
  }

  if (mensajeRaw) {
    parts.push(`\nMensaje original del lead:\n"""${mensajeRaw}"""`);
  } else {
    parts.push("\nSin mensaje de texto disponible.");
  }

  return parts.join("\n");
}

// ── Nodo de scoring ─────────────────────────────────────────────────────────

async function scoreLeadNode(
  state: LeadScoringStateType,
): Promise<Partial<LeadScoringStateType>> {
  const input = state.input;

  try {
    const raw = await llmStructured.invoke([
      { role: "system", content: buildSystemPrompt(input) },
      { role: "user", content: buildUserMessage(input) },
    ]);

    const scoringResult: AIScoringResult = {
      pcloseAdjustment: raw.pcloseAdjustment,
      valueAdjustment: raw.valueAdjustment,
      urgencyAdjustment: raw.urgencyAdjustment,
      qualitativeSignals: raw.qualitativeSignals,
      confidence: raw.confidence,
      reasoning: raw.reasoning,
    };

    return { scoringResult };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `Error en scoring IA: ${msg}` };
  }
}

// ── Grafo compilado ─────────────────────────────────────────────────────────

export const leadScoringGraph = new StateGraph(LeadScoringState)
  .addNode("scoreLead", scoreLeadNode)
  .addEdge(START, "scoreLead")
  .addEdge("scoreLead", END)
  .compile();

// ── Función de entrada pública ──────────────────────────────────────────────

export async function scoreLeadWithAI(
  input: AIScoringGraphInput,
): Promise<AIScoringResult> {
  const result = await leadScoringGraph.invoke({ input });

  if (result.error) throw new Error(result.error);
  if (!result.scoringResult) throw new Error("El agente de scoring IA no produjo resultado");

  return result.scoringResult;
}
