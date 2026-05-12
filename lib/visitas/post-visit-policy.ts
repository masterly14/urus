import type { DemandVariables, NLUResult } from "@/lib/agents/types";
import {
  POST_VISIT_AUTO_UPDATE_CONFIDENCE_THRESHOLD,
  POST_VISIT_POLICY_VERSION,
  type PostVisitPolicyDecision,
  type PostVisitPolicyState,
  type PostVisitStructuredContext,
} from "./post-visit-context-types";

const CONFIRMATION_RE = /\b(si|sí|correcto|exacto|tal cual|asi es|así es|eso es|confirmo|vale|ok)\b/iu;
const NEGATION_RE = /\b(no|para nada|incorrecto|eso no|no es eso|mejor no)\b/iu;

function hasVariables(variables: DemandVariables): boolean {
  return Object.keys(variables).length > 0;
}

function mergeVariables(...items: DemandVariables[]): DemandVariables {
  return items.reduce<DemandVariables>((acc, item) => ({ ...acc, ...item }), {});
}

function confidenceForVariables(
  structured: PostVisitStructuredContext,
  variables: DemandVariables,
): number {
  const fields = Object.keys(variables) as Array<keyof DemandVariables>;
  if (fields.length === 0) return 0;
  const total = fields.reduce((sum, field) => sum + (structured.confidenceByField[field] ?? 1), 0);
  return Math.min(1, total / fields.length);
}

function buildState(input: {
  structured: PostVisitStructuredContext;
  ruleApplied: PostVisitPolicyState["ruleApplied"];
  pendingConfirmationFields: PostVisitPolicyState["pendingConfirmationFields"];
  autoPromotableVariables: DemandVariables;
  buyerText?: string;
}): PostVisitPolicyState {
  return {
    mode: "hybrid",
    threshold: POST_VISIT_AUTO_UPDATE_CONFIDENCE_THRESHOLD,
    ruleApplied: input.ruleApplied,
    conflictResolvedBy: "buyer_priority",
    pendingConfirmationFields: input.pendingConfirmationFields,
    autoPromotableVariables: input.autoPromotableVariables,
    ...(input.buyerText ? { lastBuyerText: input.buyerText } : {}),
    lastEvaluatedAt: new Date().toISOString(),
    policyVersion: POST_VISIT_POLICY_VERSION,
  };
}

function confirmationPrompt(structured: PostVisitStructuredContext, pendingFields: string[]): string {
  const pending = pendingFields.length > 0
    ? pendingFields.join(", ")
    : "los cambios comentados en la visita";
  return [
    `Tengo apuntado: ${structured.summary}.`,
    `Antes de ajustar la busqueda, ¿me confirmas si esto es correcto? (${pending})`,
  ].join("\n\n");
}

export function evaluatePostVisitPolicy(input: {
  structured: PostVisitStructuredContext | null;
  buyerText: string;
  nlu?: NLUResult;
}): PostVisitPolicyDecision {
  const { structured, buyerText, nlu } = input;
  if (!structured) {
    return {
      action: "no_action",
      ruleApplied: "no_action",
      reason: "No hay contexto post-visita estructurado",
      state: buildState({
        structured: {
          source: "commercial_post_visit",
          rawText: "",
          summary: "",
          hardConstraints: {},
          softPreferences: {},
          rejections: [],
          ambiguities: [],
          confidenceByField: {},
          autoPromotableVariables: {},
          requiresBuyerConfirmation: [],
          normalizedAt: new Date().toISOString(),
          normalizerVersion: "empty",
        },
        ruleApplied: "no_action",
        pendingConfirmationFields: [],
        autoPromotableVariables: {},
        buyerText,
      }),
    };
  }

  const buyerVariables = nlu?.variables ?? {};
  if (hasVariables(buyerVariables) && (nlu?.intention === "NO_ME_ENCAJA" || nlu?.intention === "BUSCO_DIFERENTE")) {
    const state = buildState({
      structured,
      ruleApplied: "buyer_confirmed",
      pendingConfirmationFields: [],
      autoPromotableVariables: buyerVariables,
      buyerText,
    });
    return {
      action: "emit_update",
      ruleApplied: "buyer_confirmed",
      variables: buyerVariables,
      confidence: nlu.confidence,
      reason: "El comprador aportó/corrigió variables; prevalece comprador",
      state,
    };
  }

  const buyerConfirms = CONFIRMATION_RE.test(buyerText) && !NEGATION_RE.test(buyerText);
  if (buyerConfirms) {
    const confirmedVariables = mergeVariables(
      structured.hardConstraints,
      structured.softPreferences,
    );
    if (hasVariables(confirmedVariables)) {
      const state = buildState({
        structured,
        ruleApplied: "buyer_confirmed",
        pendingConfirmationFields: [],
        autoPromotableVariables: confirmedVariables,
        buyerText,
      });
      return {
        action: "emit_update",
        ruleApplied: "buyer_confirmed",
        variables: confirmedVariables,
        confidence: confidenceForVariables(structured, confirmedVariables),
        reason: "El comprador confirmó el briefing post-visita",
        state,
      };
    }
  }

  const autoVariables = structured.autoPromotableVariables;
  if (hasVariables(autoVariables) && !NEGATION_RE.test(buyerText)) {
    const pending = structured.requiresBuyerConfirmation;
    const state = buildState({
      structured,
      ruleApplied: "auto_hard_rule",
      pendingConfirmationFields: pending,
      autoPromotableVariables: autoVariables,
      buyerText,
    });
    return {
      action: "emit_update",
      ruleApplied: "auto_hard_rule",
      variables: autoVariables,
      confidence: confidenceForVariables(structured, autoVariables),
      reason: "Restricciones hard con alta claridad sin conflicto del comprador",
      state,
    };
  }

  if (structured.requiresBuyerConfirmation.length > 0 || NEGATION_RE.test(buyerText)) {
    const pending = structured.requiresBuyerConfirmation.length > 0
      ? structured.requiresBuyerConfirmation
      : [...Object.keys(structured.hardConstraints), ...Object.keys(structured.softPreferences)] as PostVisitPolicyState["pendingConfirmationFields"];
    const state = buildState({
      structured,
      ruleApplied: "requires_buyer_confirmation",
      pendingConfirmationFields: pending,
      autoPromotableVariables: {},
      buyerText,
    });
    return {
      action: "ask_confirmation",
      ruleApplied: "requires_buyer_confirmation",
      confirmationPrompt: confirmationPrompt(structured, pending.map(String)),
      pendingFields: pending,
      reason: "Contexto soft, ambiguo o corregido; requiere confirmación del comprador",
      state,
    };
  }

  return {
    action: "no_action",
    ruleApplied: "no_action",
    reason: "No hay variables promocionables ni confirmación útil",
    state: buildState({
      structured,
      ruleApplied: "no_action",
      pendingConfirmationFields: structured.requiresBuyerConfirmation,
      autoPromotableVariables: {},
      buyerText,
    }),
  };
}
