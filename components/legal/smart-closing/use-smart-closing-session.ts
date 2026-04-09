"use client";

import type { ContractVoiceStructuredPatch } from "@/lib/agents/contract-instruction-types";
import { convertDocxBase64ToHtml } from "@/lib/legal/smart-closing/docx-to-html";
import {
  coerceEditedValue,
  getValueAtPath,
  parsePayloadPath,
  setValueAtPath,
  valuesEqualForPayload,
} from "@/lib/legal/smart-closing/payload-path-edit";
import {
  mergeVoiceApplyIntoSession,
  type SmartClosingDocState,
  type VoiceApplyClientResponse,
} from "@/lib/legal/smart-closing/voice-apply-session";
import type { ContractFieldIssue, ContractTemplateInput } from "@/types/contracts";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";

/** Contexto para persistir CONTRATO_VERSIONADO tras voice-apply (Neon). */
export interface SmartClosingVersioningContext {
  propertyCode: string;
  operationId: string;
  actorUserId?: string;
  recordVersionEvent?: boolean;
}

export type SmartClosingPhase =
  | "idle"
  | "loading_initial"
  | "converting_preview"
  | "applying_voice"
  | "error";

export type SignaturePhase = "idle" | "sending" | "sent" | "error";

export interface SignatureSigner {
  name: string;
  email: string;
  phone?: string;
  role?: string;
}

export interface SignatureResult {
  signatureRequestId: string;
  signingUrl: string | null;
  status: string;
  normalizedToPdf: boolean;
  documentHash?: string;
}

function isVoiceApplyResponse(data: unknown): data is VoiceApplyClientResponse {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  if (typeof d.ok !== "boolean" || d.patch === undefined || !Array.isArray(d.appliedSummaries)) {
    return false;
  }
  if (d.ok === true) {
    return (
      typeof d.docxBase64 === "string" &&
      typeof d.docxFileName === "string" &&
      d.updatedInput !== undefined
    );
  }
  if (d.needsClarification === true) {
    return (
      Array.isArray(d.validationIssues) &&
      Array.isArray(d.clarificationQuestions) &&
      d.updatedInput !== undefined
    );
  }
  return Array.isArray(d.validationIssues) && d.updatedInput !== undefined;
}

export function useSmartClosingSession(
  initialInput: ContractTemplateInput,
  options?: { versioningContext?: SmartClosingVersioningContext },
) {
  const versioningContextRef = useRef(options?.versioningContext);
  versioningContextRef.current = options?.versioningContext;

  const [phase, setPhase] = useState<SmartClosingPhase>("loading_initial");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [docState, setDocState] = useState<SmartClosingDocState>({
    contractTemplateInput: initialInput,
    docxBase64: null,
    docxFileName: null,
  });
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [lastPatch, setLastPatch] = useState<ContractVoiceStructuredPatch | null>(null);
  const [appliedSummaries, setAppliedSummaries] = useState<string[]>([]);
  const [validationIssues, setValidationIssues] = useState<ContractFieldIssue[]>([]);
  const [clarificationQuestions, setClarificationQuestions] = useState<string[]>([]);
  const [approved, setApproved] = useState(false);
  const [signaturePhase, setSignaturePhase] = useState<SignaturePhase>("idle");
  const [signatureResult, setSignatureResult] = useState<SignatureResult | null>(null);
  const [signatureError, setSignatureError] = useState<string | null>(null);

  const docStateRef = useRef(docState);
  useEffect(() => {
    docStateRef.current = docState;
  }, [docState]);

  const refreshPreviewFromBase64 = useCallback(async (base64: string): Promise<boolean> => {
    setPhase("converting_preview");
    setErrorMessage(null);
    try {
      const html = await convertDocxBase64ToHtml(base64);
      setPreviewHtml(html);
      setPhase("idle");
      return true;
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Error al convertir DOCX a vista previa");
      setPhase("error");
      return false;
    }
  }, []);

  const loadInitialRender = useCallback(
    async (input: ContractTemplateInput): Promise<boolean> => {
      setPhase("loading_initial");
      setErrorMessage(null);
      setValidationIssues([]);
      setClarificationQuestions([]);
      try {
        const res = await fetch("/api/contracts/render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contractTemplateInput: input }),
        });
        const data: unknown = await res.json();
        if (!res.ok) {
          const err = data as { error?: string };
          setErrorMessage(err.error ?? `Error HTTP ${res.status}`);
          setPhase("error");
          return false;
        }
        const body = data as {
          ok?: boolean;
          docxBase64?: string;
          docxFileName?: string;
          validationIssues?: ContractFieldIssue[];
        };
        if (body.ok === false) {
          setValidationIssues(body.validationIssues ?? []);
          setErrorMessage("El borrador no supera la validación inicial.");
          setPhase("error");
          return false;
        }
        if (typeof body.docxBase64 !== "string" || typeof body.docxFileName !== "string") {
          setErrorMessage("Respuesta de render inválida");
          setPhase("error");
          return false;
        }
        setDocState({
          contractTemplateInput: input,
          docxBase64: body.docxBase64,
          docxFileName: body.docxFileName,
        });
        const previewOk = await refreshPreviewFromBase64(body.docxBase64);
        return previewOk;
      } catch (e) {
        setErrorMessage(e instanceof Error ? e.message : "Error de red");
        setPhase("error");
        return false;
      }
    },
    [refreshPreviewFromBase64],
  );

  const payloadEditInFlight = useRef(false);

  const commitPayloadFieldEdit = useCallback(
    async (path: string, rawValue: string): Promise<boolean> => {
      if (approved) return false;

      const current = docStateRef.current.contractTemplateInput;

      try {
        const segments = parsePayloadPath(path);
        const payload = current.payload as unknown as Record<string, unknown>;
        const oldVal = getValueAtPath(payload, segments);
        const coerced = coerceEditedValue(rawValue, oldVal);
        if (valuesEqualForPayload(coerced, oldVal)) return true;

        const nextPayload = structuredClone(payload) as Record<string, unknown>;
        setValueAtPath(nextPayload, segments, coerced);
        const nextInput = { ...current, payload: nextPayload } as unknown as ContractTemplateInput;

        if (payloadEditInFlight.current) return false;
        payloadEditInFlight.current = true;
        try {
          return await loadInitialRender(nextInput);
        } finally {
          payloadEditInFlight.current = false;
        }
      } catch (e) {
        setErrorMessage(e instanceof Error ? e.message : "No se pudo aplicar el cambio");
        setPhase("error");
        return false;
      }
    },
    [approved, loadInitialRender],
  );

  useEffect(() => {
    startTransition(() => {
      void loadInitialRender(initialInput);
    });
  }, [initialInput, loadInitialRender]);

  const applyVoiceTranscript = useCallback(
    async (transcript: string) => {
      if (approved) return;
      const trimmed = transcript.trim();
      if (!trimmed) {
        setErrorMessage("La transcripción está vacía.");
        setPhase("error");
        return;
      }

      setPhase("applying_voice");
      setErrorMessage(null);
      setValidationIssues([]);
      setClarificationQuestions([]);

      try {
        const current = docStateRef.current;
        const vc = versioningContextRef.current;
        const res = await fetch("/api/contracts/voice-apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript: trimmed,
            contractTemplateInput: current.contractTemplateInput,
            ...(vc
              ? {
                  versioningContext: {
                    ...vc,
                    recordVersionEvent: vc.recordVersionEvent !== false,
                  },
                }
              : {}),
          }),
        });

        const data: unknown = await res.json();

        if (!res.ok) {
          const err = data as { error?: string };
          setErrorMessage(err.error ?? `Error HTTP ${res.status}`);
          setPhase("error");
          return;
        }

        if (!isVoiceApplyResponse(data)) {
          setErrorMessage("Respuesta de voice-apply inválida");
          setPhase("error");
          return;
        }

        const merged = mergeVoiceApplyIntoSession(docStateRef.current, data);
        setDocState(merged.doc);
        setLastPatch(merged.lastPatch);
        setAppliedSummaries(merged.appliedSummaries);
        setValidationIssues(merged.validationIssues);
        setClarificationQuestions(merged.clarificationQuestions);

        if (data.ok && merged.doc.docxBase64) {
          await refreshPreviewFromBase64(merged.doc.docxBase64);
        } else {
          setPhase("idle");
        }
      } catch (e) {
        setErrorMessage(e instanceof Error ? e.message : "Error de red");
        setPhase("error");
      }
    },
    [approved, refreshPreviewFromBase64],
  );

  const approveDraft = useCallback(async () => {
    const vc = versioningContextRef.current;
    if (vc?.operationId && vc?.propertyCode) {
      try {
        const current = docStateRef.current;
        await fetch("/api/contracts/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operationId: vc.operationId,
            propertyCode: vc.propertyCode,
            documentKind: current.contractTemplateInput.kind,
            templateVersion: current.contractTemplateInput.templateVersion,
          }),
        });
      } catch {
        // MVP: si falla la persistencia, el flujo continúa (FIRMA_ENVIADA implica aprobación)
      }
    }
    setApproved(true);
    setPhase("idle");
    setErrorMessage(null);
  }, []);

  const resetApproval = useCallback(() => {
    setApproved(false);
    setSignaturePhase("idle");
    setSignatureResult(null);
    setSignatureError(null);
  }, []);

  const sendToSignature = useCallback(
    async (signers: SignatureSigner[]) => {
      const current = docStateRef.current;
      if (!current.docxBase64) {
        setSignatureError("No hay documento DOCX para enviar a firma.");
        setSignaturePhase("error");
        return;
      }

      const vc = versioningContextRef.current;
      if (!vc?.operationId || !vc?.propertyCode) {
        setSignatureError("Falta contexto de operación (operationId / propertyCode).");
        setSignaturePhase("error");
        return;
      }

      if (signers.length === 0) {
        setSignatureError("Se requiere al menos un firmante con nombre y email.");
        setSignaturePhase("error");
        return;
      }

      setSignaturePhase("sending");
      setSignatureError(null);
      setSignatureResult(null);

      try {
        const res = await fetch("/api/contracts/sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operationId: vc.operationId,
            propertyCode: vc.propertyCode,
            documentKind: current.contractTemplateInput.kind,
            templateVersion: current.contractTemplateInput.templateVersion,
            docxBase64: current.docxBase64,
            signers,
          }),
        });

        const data: unknown = await res.json();

        if (!res.ok) {
          const err = data as { error?: string; detail?: string };
          setSignatureError(err.error ?? `Error HTTP ${res.status}`);
          setSignaturePhase("error");
          return;
        }

        setSignatureResult(data as SignatureResult);
        setSignaturePhase("sent");
      } catch (e) {
        setSignatureError(e instanceof Error ? e.message : "Error de red al enviar a firma");
        setSignaturePhase("error");
      }
    },
    [],
  );

  const dismissError = useCallback(() => {
    setErrorMessage(null);
    setPhase(docStateRef.current.docxBase64 ? "idle" : "loading_initial");
  }, []);

  return {
    phase,
    errorMessage,
    setErrorMessage,
    dismissError,
    docState,
    previewHtml,
    lastPatch,
    appliedSummaries,
    validationIssues,
    clarificationQuestions,
    approved,
    applyVoiceTranscript,
    approveDraft,
    resetApproval,
    commitPayloadFieldEdit,
    reloadPreview: () => {
      const b64 = docStateRef.current.docxBase64;
      if (b64) void refreshPreviewFromBase64(b64);
    },
    signaturePhase,
    signatureResult,
    signatureError,
    sendToSignature,
  };
}
