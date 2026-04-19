/**
 * M8 — Orquesta: intérprete LangGraph → aplicar parches al payload → `generateContractDocx`.
 * Soporta arras, señal de compra y oferta en firme.
 */

import { interpretContractVoiceInstructions } from "@/lib/agents/contract-instruction-graph";
import type { ContractVoiceStructuredPatch } from "@/lib/agents/contract-instruction-types";
import type { ContractFieldIssue, ContractTemplateInput } from "@/types/contracts";
import { generateContractDocx } from "../docx";
import { bumpVoiceRevisionTemplateVersion } from "./bump-template-version";
import { applyArrasVoicePatches } from "./apply-arras-instructions";
import { applySenalCompraVoicePatches } from "./apply-senal-instructions";
import { applyOfertaFirmeVoicePatches } from "./apply-oferta-instructions";
import { getVoiceClarificationDecision } from "./clarification";

export interface InterpretVoiceAndRegenerateParams {
  transcript: string;
  input: ContractTemplateInput;
  /**
   * Fuerza el `templateVersion` del `ContractTemplateInput` resultante.
   * Si no se envía y `bumpTemplateRevision` es true (por defecto), se incrementa `_vN` solo cuando hay cambios aplicados.
   */
  outputTemplateVersion?: string;
  /**
   * Si es false, se conserva el `templateVersion` de entrada aunque haya parches aplicados.
   * @default true
   */
  bumpTemplateRevision?: boolean;
}

export type InterpretVoiceAndRegenerateResult =
  | {
      ok: true;
      patch: ContractVoiceStructuredPatch;
      appliedSummaries: string[];
      /** Versión de plantilla antes de aplicar el flujo (la del `input`). */
      previousTemplateVersion: string | undefined;
      /** Versión asignada al `updatedInput.templateVersion`. */
      nextTemplateVersion: string | undefined;
      /** true si el parche aplicó al menos un cambio estructural al payload. */
      hadAppliedChanges: boolean;
      updatedInput: ContractTemplateInput;
      docx: { bufferBase64: string; fileName: string };
      metrics: {
        interpretationMs: number;
        regenerationMs: number;
      };
    }
  | {
      ok: false;
      patch: ContractVoiceStructuredPatch;
      appliedSummaries: string[];
      previousTemplateVersion: string | undefined;
      nextTemplateVersion: string | undefined;
      hadAppliedChanges: boolean;
      updatedInput: ContractTemplateInput;
      issues: ContractFieldIssue[];
      metrics: {
        interpretationMs: number;
        regenerationMs: number;
      };
    }
  | {
      ok: false;
      needsClarification: true;
      clarificationQuestions: string[];
      patch: ContractVoiceStructuredPatch;
      appliedSummaries: string[];
      previousTemplateVersion: string | undefined;
      nextTemplateVersion: string | undefined;
      hadAppliedChanges: false;
      updatedInput: ContractTemplateInput;
      metrics: {
        interpretationMs: number;
        regenerationMs: number;
      };
    };

function toBase64(buffer: Buffer): string {
  return buffer.toString("base64");
}

type VoicePatchableInput = Extract<
  ContractTemplateInput,
  { kind: "arras" | "senal_compra" | "oferta_firme" }
>;

/** Una sola pasada: aplica el parche al payload y devuelve resúmenes (sin tocar `templateVersion`). */
function applyVoicePatchOnce(
  input: VoicePatchableInput,
  patch: ContractVoiceStructuredPatch,
): { appliedSummaries: string[]; updatedInput: VoicePatchableInput } {
  switch (input.kind) {
    case "arras": {
      const { nextPayload, appliedSummaries } = applyArrasVoicePatches(input.payload, patch);
      return {
        appliedSummaries,
        updatedInput: { ...input, payload: nextPayload },
      };
    }
    case "senal_compra": {
      const { nextPayload, appliedSummaries } = applySenalCompraVoicePatches(input.payload, patch);
      return {
        appliedSummaries,
        updatedInput: { ...input, payload: nextPayload },
      };
    }
    case "oferta_firme": {
      const { nextPayload, appliedSummaries } = applyOfertaFirmeVoicePatches(input.payload, patch);
      return {
        appliedSummaries,
        updatedInput: { ...input, payload: nextPayload },
      };
    }
  }
}

export async function interpretVoiceAndRegenerateDocx(
  params: InterpretVoiceAndRegenerateParams,
): Promise<InterpretVoiceAndRegenerateResult> {
  const { transcript, input, outputTemplateVersion, bumpTemplateRevision = true } = params;

  if (input.kind !== "arras" && input.kind !== "senal_compra" && input.kind !== "oferta_firme") {
    throw new Error(`Regeneración por voz no soportada para kind="${input.kind}".`);
  }

  const previousTemplateVersion = input.templateVersion;

  const interpretationStartedAt = Date.now();
  const patch = await interpretContractVoiceInstructions({
    transcript,
    documentKind: input.kind,
    currentPayload: input.payload,
  } as Parameters<typeof interpretContractVoiceInstructions>[0]);
  const interpretationMs = Date.now() - interpretationStartedAt;

  const clarification = getVoiceClarificationDecision(patch);
  if (clarification.needsClarification) {
    return {
      ok: false,
      needsClarification: true,
      clarificationQuestions: clarification.questions,
      patch,
      appliedSummaries: [],
      previousTemplateVersion,
      nextTemplateVersion: input.templateVersion,
      hadAppliedChanges: false,
      updatedInput: input,
      metrics: {
        interpretationMs,
        regenerationMs: 0,
      },
    };
  }

  const voiceInput = input as VoicePatchableInput;
  const { appliedSummaries, updatedInput: patched } = applyVoicePatchOnce(voiceInput, patch);
  const hadAppliedChanges = appliedSummaries.length > 0;

  let resolvedVersion = outputTemplateVersion;
  if (resolvedVersion === undefined) {
    if (bumpTemplateRevision) {
      resolvedVersion = bumpVoiceRevisionTemplateVersion(input.templateVersion, hadAppliedChanges);
    } else {
      resolvedVersion = input.templateVersion;
    }
  }

  const updatedInput: ContractTemplateInput = {
    ...patched,
    templateVersion: resolvedVersion,
  };
  const nextTemplateVersion = updatedInput.templateVersion;

  const regenerationStartedAt = Date.now();
  const docxResult = await generateContractDocx(updatedInput);
  const regenerationMs = Date.now() - regenerationStartedAt;

  if (!docxResult.ok) {
    return {
      ok: false,
      patch,
      appliedSummaries,
      previousTemplateVersion,
      nextTemplateVersion,
      hadAppliedChanges,
      updatedInput,
      issues: docxResult.issues,
      metrics: {
        interpretationMs,
        regenerationMs,
      },
    };
  }

  return {
    ok: true,
    patch,
    appliedSummaries,
    previousTemplateVersion,
    nextTemplateVersion,
    hadAppliedChanges,
    updatedInput,
    docx: {
      bufferBase64: toBase64(docxResult.buffer),
      fileName: docxResult.fileName,
    },
    metrics: {
      interpretationMs,
      regenerationMs,
    },
  };
}

/**
 * @deprecated Usa `interpretVoiceAndRegenerateDocx` que soporta los tres tipos.
 */
export const interpretVoiceAndRegenerateArrasDocx = interpretVoiceAndRegenerateDocx;
