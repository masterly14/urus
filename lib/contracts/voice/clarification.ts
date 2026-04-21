import type { ContractVoiceStructuredPatch } from "@/lib/agents/contract-instruction-types";

export const VOICE_APPLY_CLARIFICATION_THRESHOLD = 0.50;

export interface VoiceClarificationDecision {
  needsClarification: boolean;
  questions: string[];
}

/**
 * Determina si se debe bloquear la aplicación de cambios pidiendo aclaración.
 *
 * Solo bloquea cuando la confianza es realmente baja. Si el LLM ya interpretó
 * con confianza razonable (>=threshold), las ambiguedades menores se informan
 * via `assistantMessage` sin bloquear.
 */
export function getVoiceClarificationDecision(
  patch: ContractVoiceStructuredPatch,
  threshold = VOICE_APPLY_CLARIFICATION_THRESHOLD,
): VoiceClarificationDecision {
  if (patch.noOperationalChanges) {
    return { needsClarification: false, questions: [] };
  }

  if (patch.confidence < threshold) {
    const ambiguousPoints = patch.ambiguousPoints
      .map((item) => item.trim())
      .filter(Boolean);

    const questions =
      ambiguousPoints.length > 0
        ? ambiguousPoints
        : [
            `La instruccion se interpreto con baja confianza (${Math.round(patch.confidence * 100)}%). Reformula el cambio con mas precision.`,
          ];

    return { needsClarification: true, questions };
  }

  return { needsClarification: false, questions: [] };
}
