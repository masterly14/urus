import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import type { JudgeInput, JudgeEvaluation, PropertySummaryForNLU } from "./types";

const judgeLlm = new ChatOpenAI({
  model: "gpt-4o",
  temperature: 0,
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 60_000,
});

const JudgeLLMOutputSchema = z.object({
  propertyResolutionScore: z.number().min(0).max(1).describe(
    "0-1: Qué tan bien identificó el NLU las propiedades concretas que el comprador mencionó. " +
    "1.0 si identificó todas las correctas sin extras. 0.0 si no identificó ninguna."
  ),
  sentimentAccuracyScore: z.number().min(0).max(1).describe(
    "0-1: Qué tan correctamente clasificó el sentimiento (ME_INTERESA/NO_ME_ENCAJA) por cada propiedad. " +
    "1.0 si todos los sentimientos son correctos."
  ),
  variableExtractionScore: z.number().min(0).max(1).describe(
    "0-1: Qué tan bien extrajo las variables de demanda que el comprador mencionó. " +
    "1.0 si extrajo todas las variables relevantes sin inventar."
  ),
  reasoning: z.string().describe("Explicación detallada de la evaluación."),
  failures: z.array(z.string()).describe("Lista de fallos concretos detectados. Array vacío si no hay fallos."),
});

const judgeLlmStructured = judgeLlm.withStructuredOutput(JudgeLLMOutputSchema, {
  name: "evaluar_resultado_nlu",
});

function formatPropertiesForJudge(properties: PropertySummaryForNLU[]): string {
  return properties.map((p, i) => {
    const parts = [`${i + 1}. ID=${p.propertyId} | ${p.title}`];
    if (p.price != null) parts.push(`${p.price}€`);
    if (p.zone) parts.push(p.zone);
    if (p.metersBuilt != null) parts.push(`${p.metersBuilt}m²`);
    if (p.rooms != null) parts.push(`${p.rooms} hab`);
    if (p.extras.length > 0) parts.push(`Extras: ${p.extras.join(", ")}`);
    return parts.join(" | ");
  }).join("\n");
}

function computeDeterministicScores(input: JudgeInput): {
  hallucinationPenalty: number;
  intentionScore: number;
  wantsMoreScore: number;
} {
  const { nluResult, expectedOutcome, properties } = input;
  const validIds = new Set(properties.map((p) => p.propertyId));

  const invalidFeedback = nluResult.propertyFeedback.filter(
    (f) => !validIds.has(f.propertyId),
  );
  const hallucinationPenalty = invalidFeedback.length > 0
    ? Math.min(1, invalidFeedback.length / Math.max(1, nluResult.propertyFeedback.length))
    : 0;

  let intentionScore = 1.0;
  if (expectedOutcome.intention) {
    intentionScore = nluResult.intention === expectedOutcome.intention ? 1.0 : 0.0;
  }

  let wantsMoreScore = 1.0;
  if (expectedOutcome.wantsMoreOptions !== undefined) {
    wantsMoreScore = (nluResult.wantsMoreOptions ?? false) === expectedOutcome.wantsMoreOptions ? 1.0 : 0.0;
  }

  return { hallucinationPenalty, intentionScore, wantsMoreScore };
}

async function computeLLMScores(input: JudgeInput): Promise<{
  propertyResolutionScore: number;
  sentimentAccuracyScore: number;
  variableExtractionScore: number;
  reasoning: string;
  failures: string[];
}> {
  const { scenario, buyerMessage, nluResult, properties, expectedOutcome } = input;

  const systemPrompt = `Eres un evaluador experto de sistemas NLU inmobiliarios.

Tu tarea es evaluar qué tan bien un sistema NLU interpretó el mensaje de WhatsApp de un comprador que estaba viendo propiedades en un microsite.

PROPIEDADES DEL MICROSITE (con IDs reales):
${formatPropertiesForJudge(properties)}

RESULTADO ESPERADO (ground truth del escenario "${scenario.name}"):
${expectedOutcome.propertyFeedback ? `- Propiedades mencionadas: ${JSON.stringify(expectedOutcome.propertyFeedback)}` : "- No se especifican propiedades concretas esperadas"}
${expectedOutcome.variableKeys ? `- Variables esperadas: ${expectedOutcome.variableKeys.join(", ")}` : "- No se especifican variables esperadas"}

Evalúa cada dimensión con un score de 0 a 1. Sé estricto pero justo.
- propertyResolutionScore: ¿identificó las propiedades correctas? Penaliza si faltan o sobran.
- sentimentAccuracyScore: ¿clasificó bien ME_INTERESA vs NO_ME_ENCAJA por cada propiedad?
- variableExtractionScore: ¿extrajo las variables de demanda correctas? Penaliza si inventó variables no mencionadas.`;

  const userPrompt = `MENSAJE DEL COMPRADOR:
"${buyerMessage}"

RESULTADO DEL NLU:
- Intención: ${nluResult.intention} (confianza: ${nluResult.confidence})
- PropertyFeedback: ${JSON.stringify(nluResult.propertyFeedback)}
- Variables: ${JSON.stringify(nluResult.variables)}
- WantsMoreOptions: ${nluResult.wantsMoreOptions}
- Razonamiento NLU: ${nluResult.reasoning ?? "N/A"}

Evalúa el resultado.`;

  const result = await judgeLlmStructured.invoke([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);

  return {
    propertyResolutionScore: result.propertyResolutionScore,
    sentimentAccuracyScore: result.sentimentAccuracyScore,
    variableExtractionScore: result.variableExtractionScore,
    reasoning: result.reasoning,
    failures: result.failures,
  };
}

const SCORE_WEIGHTS = {
  propertyResolution: 0.25,
  sentimentAccuracy: 0.20,
  variableExtraction: 0.15,
  intention: 0.15,
  wantsMore: 0.10,
  hallucination: 0.15,
};

export async function evaluateNLUResult(input: JudgeInput): Promise<JudgeEvaluation> {
  const deterministic = computeDeterministicScores(input);
  const llmScores = await computeLLMScores(input);

  const allFailures = [...llmScores.failures];
  if (deterministic.hallucinationPenalty > 0) {
    allFailures.push(`Hallucination: ${deterministic.hallucinationPenalty.toFixed(2)} de los propertyIds no existen en el listado`);
  }
  if (deterministic.intentionScore === 0) {
    allFailures.push(`Intention: esperaba ${input.expectedOutcome.intention}, obtuvo ${input.nluResult.intention}`);
  }
  if (deterministic.wantsMoreScore === 0) {
    allFailures.push(`WantsMore: esperaba ${input.expectedOutcome.wantsMoreOptions}, obtuvo ${input.nluResult.wantsMoreOptions}`);
  }

  const hallucinationScore = 1 - deterministic.hallucinationPenalty;

  const overallScore =
    llmScores.propertyResolutionScore * SCORE_WEIGHTS.propertyResolution +
    llmScores.sentimentAccuracyScore * SCORE_WEIGHTS.sentimentAccuracy +
    llmScores.variableExtractionScore * SCORE_WEIGHTS.variableExtraction +
    deterministic.intentionScore * SCORE_WEIGHTS.intention +
    deterministic.wantsMoreScore * SCORE_WEIGHTS.wantsMore +
    hallucinationScore * SCORE_WEIGHTS.hallucination;

  return {
    propertyResolutionScore: llmScores.propertyResolutionScore,
    sentimentAccuracyScore: llmScores.sentimentAccuracyScore,
    variableExtractionScore: llmScores.variableExtractionScore,
    intentionScore: deterministic.intentionScore,
    wantsMoreScore: deterministic.wantsMoreScore,
    hallucinationPenalty: deterministic.hallucinationPenalty,
    overallScore: Math.round(overallScore * 1000) / 1000,
    reasoning: llmScores.reasoning,
    failures: allFailures,
  };
}
