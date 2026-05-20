/**
 * Estado documento tras `voice-apply` y fusión con respuesta API (testable sin React).
 */

import type { ContractVoiceStructuredPatch } from "@/lib/agents/contract-instruction-types";
import type { ContractFieldIssue, ContractTemplateInput } from "@/types/contracts";
import type { AdditionalClausesDoc } from "@/lib/contracts/additional-clauses/types";
import type { SectionAddendumsList } from "@/lib/contracts/section-addendums/types";

export interface SmartClosingDocState {
  contractTemplateInput: ContractTemplateInput;
  docxBase64: string | null;
  docxFileName: string | null;
}

interface VoiceApplySharedFields {
  updatedInput: ContractTemplateInput;
  appliedSummaries: string[];
  patch: ContractVoiceStructuredPatch;
  nextTemplateVersion?: string;
  assistantMessage?: string;
  missingDataQuestions?: string[];
  updatedAdditionalClausesDoc?: AdditionalClausesDoc | null;
  updatedSectionAddendums?: SectionAddendumsList | null;
}

export type VoiceApplyClientResponse =
  | (VoiceApplySharedFields & {
      ok: true;
      docxBase64: string;
      docxFileName: string;
    })
  | (VoiceApplySharedFields & {
      ok: false;
      needsClarification?: false;
      validationIssues: ContractFieldIssue[];
    })
  | (VoiceApplySharedFields & {
      ok: false;
      needsClarification: true;
      validationIssues: ContractFieldIssue[];
      clarificationQuestions: string[];
    });

export interface VoiceApplyUiDelta {
  doc: SmartClosingDocState;
  lastPatch: ContractVoiceStructuredPatch;
  appliedSummaries: string[];
  validationIssues: ContractFieldIssue[];
  clarificationQuestions: string[];
  nextTemplateVersion?: string;
  assistantMessage: string;
  missingDataQuestions: string[];
  updatedAdditionalClausesDoc: AdditionalClausesDoc | null;
  updatedSectionAddendums: SectionAddendumsList | null;
}

/** Si `ok: false`, conserva el borrador DOCX y el input previos (validación falló tras el parche). */
export function mergeVoiceApplyIntoSession(
  prev: SmartClosingDocState,
  res: VoiceApplyClientResponse,
): VoiceApplyUiDelta {
  const shared = {
    lastPatch: res.patch,
    appliedSummaries: res.appliedSummaries,
    nextTemplateVersion: res.nextTemplateVersion,
    assistantMessage: res.assistantMessage ?? "",
    missingDataQuestions: res.missingDataQuestions ?? [],
    updatedAdditionalClausesDoc: res.updatedAdditionalClausesDoc ?? null,
    updatedSectionAddendums: res.updatedSectionAddendums ?? null,
  };

  if (res.ok) {
    return {
      doc: {
        contractTemplateInput: res.updatedInput,
        docxBase64: res.docxBase64,
        docxFileName: res.docxFileName,
      },
      ...shared,
      validationIssues: [],
      clarificationQuestions: [],
    };
  }
  if (res.needsClarification) {
    return {
      doc: {
        contractTemplateInput: prev.contractTemplateInput,
        docxBase64: prev.docxBase64,
        docxFileName: prev.docxFileName,
      },
      ...shared,
      validationIssues: [],
      clarificationQuestions: res.clarificationQuestions,
    };
  }
  return {
    doc: {
      contractTemplateInput: prev.contractTemplateInput,
      docxBase64: prev.docxBase64,
      docxFileName: prev.docxFileName,
    },
    ...shared,
    validationIssues: res.validationIssues,
    clarificationQuestions: [],
  };
}
