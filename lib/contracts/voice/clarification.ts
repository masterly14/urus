import type { ContractVoiceStructuredPatch } from "@/lib/agents/contract-instruction-types";

export const VOICE_APPLY_CLARIFICATION_THRESHOLD = 0.65;

export interface VoiceClarificationDecision {
  needsClarification: boolean;
  questions: string[];
}

export function getVoiceClarificationDecision(
  patch: ContractVoiceStructuredPatch,
  threshold = VOICE_APPLY_CLARIFICATION_THRESHOLD,
): VoiceClarificationDecision {
  const ambiguousPoints = patch.ambiguousPoints
    .map((item) => item.trim())
    .filter(Boolean);

  if (patch.noOperationalChanges) {
    return {
      needsClarification: false,
      questions: [],
    };
  }

  if (ambiguousPoints.length > 0) {
    return {
      needsClarification: true,
      questions: ambiguousPoints,
    };
  }

  if (patch.confidence < threshold) {
    return {
      needsClarification: true,
      questions: [
        `La instrucción se interpretó con baja confianza (${Math.round(patch.confidence * 100)}%). Reformula el cambio con más precisión.`,
      ],
    };
  }

  return {
    needsClarification: false,
    questions: [],
  };
}
