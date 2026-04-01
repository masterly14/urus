/**
 * Estado documento tras `voice-apply` y fusión con respuesta API (testable sin React).
 */

import type { ContractVoiceStructuredPatch } from "@/lib/agents/contract-instruction-types";
import type { ContractFieldIssue, ContractTemplateInput } from "@/types/contracts";

export interface SmartClosingDocState {
  contractTemplateInput: ContractTemplateInput;
  docxBase64: string | null;
  docxFileName: string | null;
}

export type VoiceApplyClientResponse =
  | {
      ok: true;
      updatedInput: ContractTemplateInput;
      docxBase64: string;
      docxFileName: string;
      appliedSummaries: string[];
      patch: ContractVoiceStructuredPatch;
      nextTemplateVersion?: string;
    }
  | {
      ok: false;
      updatedInput: ContractTemplateInput;
      validationIssues: ContractFieldIssue[];
      appliedSummaries: string[];
      patch: ContractVoiceStructuredPatch;
      nextTemplateVersion?: string;
    };

export interface VoiceApplyUiDelta {
  doc: SmartClosingDocState;
  lastPatch: ContractVoiceStructuredPatch;
  appliedSummaries: string[];
  validationIssues: ContractFieldIssue[];
  nextTemplateVersion?: string;
}

/** Si `ok: false`, conserva el borrador DOCX y el input previos (validación falló tras el parche). */
export function mergeVoiceApplyIntoSession(
  prev: SmartClosingDocState,
  res: VoiceApplyClientResponse,
): VoiceApplyUiDelta {
  if (res.ok) {
    return {
      doc: {
        contractTemplateInput: res.updatedInput,
        docxBase64: res.docxBase64,
        docxFileName: res.docxFileName,
      },
      lastPatch: res.patch,
      appliedSummaries: res.appliedSummaries,
      validationIssues: [],
      nextTemplateVersion: res.nextTemplateVersion,
    };
  }
  return {
    doc: {
      contractTemplateInput: prev.contractTemplateInput,
      docxBase64: prev.docxBase64,
      docxFileName: prev.docxFileName,
    },
    lastPatch: res.patch,
    appliedSummaries: res.appliedSummaries,
    validationIssues: res.validationIssues,
    nextTemplateVersion: res.nextTemplateVersion,
  };
}
