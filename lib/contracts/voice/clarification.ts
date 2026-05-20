import type { ContractVoiceStructuredPatch } from "@/lib/agents/contract-instruction-types";

export const VOICE_APPLY_CLARIFICATION_THRESHOLD = 0.50;

export interface VoiceClarificationDecision {
  needsClarification: boolean;
  questions: string[];
}

/**
 * Determina si se debe bloquear la aplicación de cambios pidiendo aclaración.
 *
 * Bloquea cuando hay ambigüedades explícitas o cuando la confianza es baja.
 */
export function getVoiceClarificationDecision(
  patch: ContractVoiceStructuredPatch,
  threshold = VOICE_APPLY_CLARIFICATION_THRESHOLD,
): VoiceClarificationDecision {
  const ambiguousPoints = patch.ambiguousPoints
    .map((item) => item.trim())
    .filter(Boolean);

  if (patch.noOperationalChanges) {
    return { needsClarification: false, questions: [] };
  }

  if (ambiguousPoints.length > 0) {
    return { needsClarification: true, questions: ambiguousPoints };
  }

  if (patch.confidence < threshold) {
    const questions =
      [
        `La instruccion se interpreto con baja confianza (${Math.round(patch.confidence * 100)}%). Reformula el cambio con mas precision.`,
      ];

    return { needsClarification: true, questions };
  }

  return { needsClarification: false, questions: [] };
}
