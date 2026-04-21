/**
 * M8 — Orquesta: intérprete LangGraph → aplicar parches al payload → `generateContractDocx`.
 * Soporta arras, señal de compra y oferta en firme.
 */

import { interpretContractVoiceInstructions } from "@/lib/agents/contract-instruction-graph";
import type { ContractVoiceStructuredPatch } from "@/lib/agents/contract-instruction-types";
import type { ContractFieldIssue, ContractTemplateInput } from "@/types/contracts";
import type { AdditionalClausesDoc, AdditionalClauseBlock } from "@/lib/contracts/additional-clauses/types";
import { EMPTY_ADDITIONAL_CLAUSES_DOC } from "@/lib/contracts/additional-clauses/types";
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
  /**
   * Cláusulas adicionales libres a incluir al regenerar el DOCX. Se
   * propagan tal cual a `generateContractDocx` — la voz no las modifica.
   */
  additionalClausesDoc?: AdditionalClausesDoc | null;
}

interface SharedResultFields {
  patch: ContractVoiceStructuredPatch;
  appliedSummaries: string[];
  previousTemplateVersion: string | undefined;
  nextTemplateVersion: string | undefined;
  hadAppliedChanges: boolean;
  updatedInput: ContractTemplateInput;
  /** Mensaje conversacional del asistente para mostrar al comercial. */
  assistantMessage: string;
  /** Preguntas sobre datos faltantes que el asistente detectó. */
  missingDataQuestions: string[];
  /** additionalClausesDoc actualizado (incluye clausulas dictadas por voz). */
  updatedAdditionalClausesDoc: AdditionalClausesDoc | null;
  metrics: {
    interpretationMs: number;
    regenerationMs: number;
  };
}

export type InterpretVoiceAndRegenerateResult =
  | (SharedResultFields & {
      ok: true;
      docx: { bufferBase64: string; fileName: string };
    })
  | (SharedResultFields & {
      ok: false;
      issues: ContractFieldIssue[];
    })
  | (SharedResultFields & {
      ok: false;
      needsClarification: true;
      clarificationQuestions: string[];
      hadAppliedChanges: false;
    });

function toBase64(buffer: Buffer): string {
  return buffer.toString("base64");
}

function appendClauseToDoc(
  existing: AdditionalClausesDoc | null,
  text: string,
): AdditionalClausesDoc {
  const base: AdditionalClausesDoc = existing ?? { ...EMPTY_ADDITIONAL_CLAUSES_DOC };
  const blocks: AdditionalClauseBlock[] = [...(base.content ?? [])];

  const paragraphs = text.split(/\n+/).filter((line) => line.trim().length > 0);
  for (const para of paragraphs) {
    blocks.push({
      type: "paragraph",
      content: [{ type: "text", text: para.trim() }],
    });
  }

  return { type: "doc", content: blocks };
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
  const {
    transcript,
    input,
    outputTemplateVersion,
    bumpTemplateRevision = true,
    additionalClausesDoc = null,
  } = params;

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

  const assistantMessage = patch.assistantMessage || "";
  const missingDataQuestions = patch.missingDataQuestions ?? [];

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
      assistantMessage: assistantMessage || clarification.questions.join(" "),
      missingDataQuestions,
      updatedAdditionalClausesDoc: additionalClausesDoc ?? null,
      metrics: {
        interpretationMs,
        regenerationMs: 0,
      },
    };
  }

  const voiceInput = input as VoicePatchableInput;
  const { appliedSummaries, updatedInput: patched } = applyVoicePatchOnce(voiceInput, patch);

  let updatedClausesDoc = additionalClausesDoc ?? null;
  if (patch.additionalClauseText?.trim()) {
    updatedClausesDoc = appendClauseToDoc(updatedClausesDoc, patch.additionalClauseText);
    appliedSummaries.push("Clausula adicional anadida por voz");
  }

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
  const docxResult = await generateContractDocx(updatedInput, {
    additionalClausesDoc: updatedClausesDoc,
  });
  const regenerationMs = Date.now() - regenerationStartedAt;

  const sharedFields = {
    patch,
    appliedSummaries,
    previousTemplateVersion,
    nextTemplateVersion,
    hadAppliedChanges,
    updatedInput,
    assistantMessage,
    missingDataQuestions,
    updatedAdditionalClausesDoc: updatedClausesDoc,
    metrics: { interpretationMs, regenerationMs },
  };

  if (!docxResult.ok) {
    return {
      ok: false,
      ...sharedFields,
      issues: docxResult.issues,
    };
  }

  return {
    ok: true,
    ...sharedFields,
    docx: {
      bufferBase64: toBase64(docxResult.buffer),
      fileName: docxResult.fileName,
    },
  };
}

/**
 * @deprecated Usa `interpretVoiceAndRegenerateDocx` que soporta los tres tipos.
 */
export const interpretVoiceAndRegenerateArrasDocx = interpretVoiceAndRegenerateDocx;
