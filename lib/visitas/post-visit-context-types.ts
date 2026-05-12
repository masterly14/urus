import type { DemandVariables } from "@/lib/agents/types";

export const POST_VISIT_NORMALIZER_VERSION = "post_visit_context_v1";
export const POST_VISIT_POLICY_VERSION = "post_visit_policy_v1";
export const POST_VISIT_AUTO_UPDATE_CONFIDENCE_THRESHOLD = 0.85;

export type PostVisitContextSource = "commercial_post_visit";
export type PostVisitPolicyMode = "hybrid";
export type PostVisitRuleApplied =
  | "auto_hard_rule"
  | "buyer_confirmed"
  | "requires_buyer_confirmation"
  | "no_action";

export type PostVisitHardField =
  | "precioMin"
  | "precioMax"
  | "metrosMin"
  | "metrosMax"
  | "habitacionesMin"
  | "ciudad"
  | "zonas"
  | "tipos";

export type PostVisitSoftField = "extras" | "extrasNoDeseados" | "rejections";

export type PostVisitFieldConfidence = Partial<Record<keyof DemandVariables | "rejections", number>>;

export type PostVisitStructuredContext = {
  source: PostVisitContextSource;
  rawText: string;
  summary: string;
  hardConstraints: Pick<
    DemandVariables,
    "precioMin" | "precioMax" | "metrosMin" | "metrosMax" | "habitacionesMin" | "ciudad" | "zonas" | "tipos"
  >;
  softPreferences: Pick<DemandVariables, "extras" | "extrasNoDeseados">;
  rejections: string[];
  ambiguities: string[];
  confidenceByField: PostVisitFieldConfidence;
  autoPromotableVariables: DemandVariables;
  requiresBuyerConfirmation: Array<keyof DemandVariables | "rejections">;
  normalizedAt: string;
  normalizerVersion: string;
};

export type PostVisitPolicyState = {
  mode: PostVisitPolicyMode;
  threshold: number;
  ruleApplied: PostVisitRuleApplied;
  conflictResolvedBy: "buyer_priority";
  pendingConfirmationFields: Array<keyof DemandVariables | "rejections">;
  autoPromotableVariables: DemandVariables;
  lastBuyerText?: string;
  lastEvaluatedAt: string;
  policyVersion: string;
};

export type PostVisitPolicyDecision =
  | {
      action: "emit_update";
      ruleApplied: "auto_hard_rule" | "buyer_confirmed";
      variables: DemandVariables;
      confidence: number;
      reason: string;
      state: PostVisitPolicyState;
    }
  | {
      action: "ask_confirmation";
      ruleApplied: "requires_buyer_confirmation";
      confirmationPrompt: string;
      pendingFields: Array<keyof DemandVariables | "rejections">;
      reason: string;
      state: PostVisitPolicyState;
    }
  | {
      action: "no_action";
      ruleApplied: "no_action";
      reason: string;
      state: PostVisitPolicyState;
    };
