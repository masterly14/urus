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

export type SmartClosingPhase =
  | "idle"
  | "loading_initial"
  | "converting_preview"
  | "applying_voice"
  | "error";

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
  return Array.isArray(d.validationIssues) && d.updatedInput !== undefined;
}

export function useSmartClosingSession(initialInput: ContractTemplateInput) {
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
  const [approved, setApproved] = useState(false);

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
        const payload = current.payload as Record<string, unknown>;
        const oldVal = getValueAtPath(payload, segments);
        const coerced = coerceEditedValue(rawValue, oldVal);
        if (valuesEqualForPayload(coerced, oldVal)) return true;

        const nextPayload = structuredClone(payload) as Record<string, unknown>;
        setValueAtPath(nextPayload, segments, coerced);
        const nextInput = { ...current, payload: nextPayload } as ContractTemplateInput;

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

      try {
        const current = docStateRef.current;
        const res = await fetch("/api/contracts/voice-apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript: trimmed,
            contractTemplateInput: current.contractTemplateInput,
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

  const approveDraft = useCallback(() => {
    setApproved(true);
    setPhase("idle");
    setErrorMessage(null);
  }, []);

  const resetApproval = useCallback(() => {
    setApproved(false);
  }, []);

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
    approved,
    applyVoiceTranscript,
    approveDraft,
    resetApproval,
    commitPayloadFieldEdit,
    reloadPreview: () => {
      const b64 = docStateRef.current.docxBase64;
      if (b64) void refreshPreviewFromBase64(b64);
    },
  };
}
