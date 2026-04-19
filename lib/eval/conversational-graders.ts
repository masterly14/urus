/**
 * Graders deterministas (code-based) para evaluación del agente conversacional.
 *
 * Cada grader recibe el output del agente y el escenario, retorna GraderResult.
 * Prioridad: rápidos, reproducibles, sin LLM. Inspirados en LangSmith agentevals.
 */

import type { ConversationalAgentOutput } from "@/lib/agents/conversational-agent-types";
import type {
  ConversationalEvalScenario,
  GraderResult,
  TrajectoryMatchMode,
} from "./conversational-types";

// ── Tool Call Grader ────────────────────────────────────────────────────────

function matchTrajectory(
  actual: string[],
  expected: string[],
  mode: TrajectoryMatchMode,
): boolean {
  switch (mode) {
    case "strict":
      return (
        actual.length === expected.length &&
        actual.every((t, i) => t === expected[i])
      );
    case "unordered": {
      const sortedActual = [...actual].sort();
      const sortedExpected = [...expected].sort();
      return (
        sortedActual.length === sortedExpected.length &&
        sortedActual.every((t, i) => t === sortedExpected[i])
      );
    }
    case "subset":
      return expected.every((t) => actual.includes(t));
    case "superset":
      return actual.every((t) => expected.includes(t));
  }
}

export function toolCallGrader(
  output: ConversationalAgentOutput,
  scenario: ConversationalEvalScenario,
): GraderResult {
  const expected = scenario.expectedToolCalls ?? [];
  const actual = output.toolResults.map((tc) => tc.toolName);
  const mode = scenario.trajectoryMatchMode ?? "subset";

  if (expected.length === 0 && actual.length === 0) {
    return { name: "toolCallGrader", passed: true, score: 1.0 };
  }

  if (expected.length === 0 && actual.length > 0) {
    return {
      name: "toolCallGrader",
      passed: false,
      score: 0.0,
      details: `No se esperaban tool calls, pero se invocaron: ${actual.join(", ")}`,
    };
  }

  const alternatives = scenario.alternativeExpectedToolCalls ?? [];
  const candidates = [expected, ...alternatives];

  const matchedIndex = candidates.findIndex((candidate) =>
    matchTrajectory(actual, candidate, mode),
  );
  const passed = matchedIndex !== -1;
  const score = passed ? 1.0 : 0.0;

  if (passed) {
    return { name: "toolCallGrader", passed: true, score };
  }

  const expectedParts = [`[${expected.join(", ")}]`, ...alternatives.map((a) => `[${a.join(", ")}]`)];
  const expectedLabel = expectedParts.length > 1 ? `alguno de {${expectedParts.join(" | ")}}` : expectedParts[0];

  return {
    name: "toolCallGrader",
    passed,
    score,
    details: `Esperado (${mode}): ${expectedLabel}, actual: [${actual.join(", ")}]`,
  };
}

// ── Response Format Grader ──────────────────────────────────────────────────

const MAX_RESPONSE_LENGTH = 500;
const FORBIDDEN_MARKDOWN_PATTERNS = [/^#{1,6}\s/m, /\*\*\*[^*]+\*\*\*/];

export function responseFormatGrader(
  output: ConversationalAgentOutput,
): GraderResult {
  const text = output.responseText;
  const failures: string[] = [];

  if (!text || text.trim().length === 0) {
    return {
      name: "responseFormatGrader",
      passed: false,
      score: 0.0,
      details: "responseText está vacío",
    };
  }

  if (text.length > MAX_RESPONSE_LENGTH) {
    failures.push(
      `Excede ${MAX_RESPONSE_LENGTH} chars (actual: ${text.length})`,
    );
  }

  for (const pattern of FORBIDDEN_MARKDOWN_PATTERNS) {
    if (pattern.test(text)) {
      failures.push(`Contiene markdown complejo: ${pattern.source}`);
    }
  }

  const passed = failures.length === 0;
  const score = passed ? 1.0 : Math.max(0, 1.0 - failures.length * 0.3);

  return {
    name: "responseFormatGrader",
    passed,
    score,
    details: passed ? undefined : failures.join("; "),
  };
}

// ── Hallucination Grader ────────────────────────────────────────────────────

export function hallucinationGrader(
  output: ConversationalAgentOutput,
  scenario: ConversationalEvalScenario,
): GraderResult {
  const text = output.responseText;
  const validPropertyIds = new Set(scenario.properties.map((p) => p.propertyId));

  const mentionedIds = text.match(/\b(eval-\w+-?\d+)\b/gi) ?? [];
  const hallucinated = mentionedIds.filter((id) => !validPropertyIds.has(id));

  if (hallucinated.length > 0) {
    return {
      name: "hallucinationGrader",
      passed: false,
      score: 0.0,
      details: `IDs de propiedades no existentes en contexto: ${hallucinated.join(", ")}`,
    };
  }

  // Extraer precios con signo € o formato "Xk"/"X mil" para detectar alucinaciones.
  // Importante: un precio mencionado como CRITERIO del comprador (repetido del mensaje
  // previo o de la historia) no es alucinación. Solo penalizamos precios que el agente
  // presenta como hechos (ficha/descripción de propiedad) y que no existen en contexto.
  const pricePattern = /(\d{3}[.,]?\d{3})\s*€/g;
  const mentionedPrices: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = pricePattern.exec(text)) !== null) {
    const price = parseInt(match[1].replace(/[.,]/g, ""), 10);
    mentionedPrices.push(price);
  }

  const validPrices = new Set(scenario.properties.map((p) => p.price));

  // Construimos un corpus con los mensajes del comprador (fixedMessage + historial)
  // para reconocer precios que vienen como criterio y no como afirmación del agente.
  const buyerCorpus = [
    scenario.fixedMessage ?? "",
    ...scenario.conversationHistory
      .filter((t) => t.role === "buyer")
      .map((t) => t.text ?? t.content ?? ""),
    scenario.buyerInstructions ?? "",
  ]
    .join(" ")
    .toLowerCase();

  function priceMentionedByBuyer(price: number): boolean {
    // Aceptamos cualquier variante: "300000", "300.000", "300,000", "300k", "300 mil".
    const variants = [
      String(price),
      price.toLocaleString("es-ES"),
      price.toLocaleString("en-US"),
      `${Math.round(price / 1000)}k`,
      `${Math.round(price / 1000)} mil`,
    ];
    return variants.some((v) => buyerCorpus.includes(v.toLowerCase()));
  }

  const inventedPrices = mentionedPrices.filter(
    (p) => !validPrices.has(p) && !priceMentionedByBuyer(p),
  );

  if (inventedPrices.length > 0) {
    return {
      name: "hallucinationGrader",
      passed: false,
      score: 0.3,
      details: `Precios no existentes en contexto: ${inventedPrices.join(", ")}`,
    };
  }

  return { name: "hallucinationGrader", passed: true, score: 1.0 };
}

// ── Forbidden Pattern Grader ────────────────────────────────────────────────

export function forbiddenPatternGrader(
  output: ConversationalAgentOutput,
  scenario: ConversationalEvalScenario,
): GraderResult {
  const patterns = scenario.forbiddenPatterns ?? [];
  if (patterns.length === 0) {
    return { name: "forbiddenPatternGrader", passed: true, score: 1.0 };
  }

  const text = output.responseText;
  const toolNames = output.toolResults.map((tc) => tc.toolName);
  const searchSpace = `${text} ${toolNames.join(" ")}`;

  const violations: string[] = [];
  for (const pattern of patterns) {
    const regex = new RegExp(pattern, "i");
    if (regex.test(searchSpace)) {
      violations.push(pattern);
    }
  }

  const passed = violations.length === 0;
  const score = passed
    ? 1.0
    : Math.max(0, 1.0 - violations.length / patterns.length);

  return {
    name: "forbiddenPatternGrader",
    passed,
    score,
    details: passed
      ? undefined
      : `Patrones prohibidos encontrados: ${violations.join(", ")}`,
  };
}

// ── Phase Transition Grader ─────────────────────────────────────────────────

const TOOL_TO_EXPECTED_PHASE: Record<string, string[]> = {
  initiate_visit: ["SCHEDULING_VISIT"],
  classify_feedback: ["GIVING_FEEDBACK", "REVIEWING_OPTIONS"],
  emit_selection_feedback: ["GIVING_FEEDBACK", "REVIEWING_OPTIONS"],
  request_more_options: ["GIVING_FEEDBACK", "REVIEWING_OPTIONS"],
  update_demand: ["REVIEWING_OPTIONS", "GIVING_FEEDBACK"],
  escalate_to_human: ["IDLE_FOLLOWUP"],
};

export function phaseTransitionGrader(
  output: ConversationalAgentOutput,
): GraderResult {
  const toolNames = output.toolResults.map((tc) => tc.toolName);
  const nextPhase = output.nextPhase;
  const failures: string[] = [];

  for (const tool of toolNames) {
    const expectedPhases = TOOL_TO_EXPECTED_PHASE[tool];
    if (expectedPhases && !expectedPhases.includes(nextPhase)) {
      failures.push(
        `Tool "${tool}" sugiere phase [${expectedPhases.join("|")}], pero nextPhase="${nextPhase}"`,
      );
    }
  }

  const passed = failures.length === 0;
  return {
    name: "phaseTransitionGrader",
    passed,
    score: passed ? 1.0 : 0.5,
    details: passed ? undefined : failures.join("; "),
  };
}

// ── Side Effect Grader ──────────────────────────────────────────────────────

export function sideEffectGrader(
  output: ConversationalAgentOutput,
  scenario: ConversationalEvalScenario,
): GraderResult {
  if (!scenario.expectedOutcome) {
    return { name: "sideEffectGrader", passed: true, score: 1.0 };
  }

  const failures: string[] = [];

  if (scenario.expectedOutcome.wantsMoreOptions) {
    // Aceptamos tanto request_more_options como update_demand: ambos producen el
    // efecto de "buscar/recalcular nuevas opciones" para el comprador.
    const hasRequestMore = output.toolResults.some(
      (tc) => tc.toolName === "request_more_options" || tc.toolName === "update_demand",
    );
    if (!hasRequestMore) {
      failures.push(
        "Se esperaba request_more_options o update_demand pero ninguno fue invocado",
      );
    }
  }

  if (scenario.expectedOutcome.propertyFeedback) {
    const hasEmit = output.toolResults.some(
      (tc) => tc.toolName === "emit_selection_feedback",
    );
    if (!hasEmit) {
      failures.push(
        "Se esperaba emit_selection_feedback para registrar feedback de propiedades",
      );
    }
  }

  const passed = failures.length === 0;
  return {
    name: "sideEffectGrader",
    passed,
    score: passed ? 1.0 : 0.0,
    details: passed ? undefined : failures.join("; "),
  };
}

// ── Latency Grader ──────────────────────────────────────────────────────────

export function latencyGrader(
  latencyMs: number,
  maxLatencyMs: number,
): GraderResult {
  const passed = latencyMs <= maxLatencyMs;
  const score = passed ? 1.0 : Math.max(0, 1.0 - (latencyMs - maxLatencyMs) / maxLatencyMs);

  return {
    name: "latencyGrader",
    passed,
    score,
    details: passed
      ? undefined
      : `Latencia ${latencyMs}ms excede umbral ${maxLatencyMs}ms`,
  };
}

// ── Idempotency Grader ──────────────────────────────────────────────────────

export function idempotencyGrader(
  firstRun: ConversationalAgentOutput,
  secondRun: ConversationalAgentOutput,
): GraderResult {
  const firstTools = firstRun.toolResults
    .filter((tc) => ["emit_selection_feedback", "update_demand", "initiate_visit"].includes(tc.toolName))
    .map((tc) => tc.toolName);

  const secondTools = secondRun.toolResults
    .filter((tc) => ["emit_selection_feedback", "update_demand", "initiate_visit"].includes(tc.toolName))
    .map((tc) => tc.toolName);

  const firstCount = firstTools.length;
  const secondCount = secondTools.length;

  if (firstCount === 0 && secondCount === 0) {
    return { name: "idempotencyGrader", passed: true, score: 1.0 };
  }

  const passed = secondCount <= firstCount;
  return {
    name: "idempotencyGrader",
    passed,
    score: passed ? 1.0 : 0.0,
    details: passed
      ? undefined
      : `Segunda ejecución produjo más side-effects (${secondCount}) que la primera (${firstCount})`,
  };
}

// ── Internal Jargon Grader ──────────────────────────────────────────────────

/**
 * Detecta que el agente NO use jerga interna del sistema al comprador.
 * "microsite" es especialmente problemático porque es nuestro término, no del cliente.
 */
const FORBIDDEN_JARGON_WORDS = [
  "microsite",
  "micrositio",
  "microsites",
  "micrositios",
];

export function internalJargonGrader(
  output: ConversationalAgentOutput,
): GraderResult {
  const text = output.responseText.toLowerCase();
  const leaked = FORBIDDEN_JARGON_WORDS.filter((word) =>
    new RegExp(`\\b${word}\\b`, "i").test(text),
  );

  if (leaked.length > 0) {
    return {
      name: "internalJargonGrader",
      passed: false,
      score: 0.0,
      details: `Usó jerga interna prohibida al comprador: ${leaked.join(", ")}`,
    };
  }

  return { name: "internalJargonGrader", passed: true, score: 1.0 };
}

// ── Runner de todos los graders para un trial ───────────────────────────────

export function runDeterministicGraders(
  output: ConversationalAgentOutput,
  scenario: ConversationalEvalScenario,
  latencyMs: number,
  maxLatencyMs: number,
): GraderResult[] {
  return [
    toolCallGrader(output, scenario),
    responseFormatGrader(output),
    hallucinationGrader(output, scenario),
    forbiddenPatternGrader(output, scenario),
    internalJargonGrader(output),
    phaseTransitionGrader(output),
    sideEffectGrader(output, scenario),
    latencyGrader(latencyMs, maxLatencyMs),
  ];
}
