"use client";

import { use, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
    ArrowLeft,
  CheckCircle2,
  History,
    Send,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DocxPreviewPanel } from "@/components/legal/smart-closing/docx-preview-panel";
import { PayloadSummaryFields } from "@/components/legal/smart-closing/payload-summary-fields";
import { SmartClosingVoicePanel } from "@/components/legal/smart-closing/voice-panel";
import { useSmartClosingSession } from "@/components/legal/smart-closing/use-smart-closing-session";
import { contratos } from "@/lib/mock-data/contratos";
import { getContractTemplateFixtureByListId } from "@/lib/mock-data/contract-template-fixtures";
import type { ContractTemplateInput } from "@/types/contracts";

const KIND_LABEL: Record<string, string> = {
  arras: "Contrato de arras",
  senal_compra: "Señal de compra",
  oferta_firme: "Oferta en firme",
  anexo_mobiliario: "Anexo mobiliario",
};

function SmartClosingContractDetail({
  contractListId,
  initialTemplate,
}: {
  contractListId: string;
  initialTemplate: ContractTemplateInput;
}) {
  const listRow = useMemo(() => contratos.find((c) => c.id === contractListId), [contractListId]);

  const [approveOpen, setApproveOpen] = useState(false);
  const [showApproveSuccess, setShowApproveSuccess] = useState(false);

  const {
    phase,
    errorMessage,
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
    reloadPreview,
    commitPayloadFieldEdit,
  } = useSmartClosingSession(initialTemplate);

  const handleApplyTranscript = useCallback(
    async (transcript: string) => {
      await applyVoiceTranscript(transcript);
    },
    [applyVoiceTranscript],
  );

  const handleConfirmApprove = useCallback(() => {
    approveDraft();
    setApproveOpen(false);
    setShowApproveSuccess(true);
    window.setTimeout(() => setShowApproveSuccess(false), 4000);
  }, [approveDraft]);

  const voiceBusy =
    phase === "applying_voice" || phase === "converting_preview" || phase === "loading_initial";

  const kindLabel = KIND_LABEL[docState.contractTemplateInput.kind] ?? "Contrato";

    return (
    <div className="flex min-h-0 flex-col gap-4 pb-6">
      <header className="flex items-center justify-between shrink-0 flex-wrap gap-3">
        <div className="flex items-center gap-4 min-w-0">
                    <Link href="/legal/contratos">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold flex items-center gap-2 truncate">
                {kindLabel}
                <Badge variant="outline" className="font-mono font-normal text-xs shrink-0">
                  {contractListId.toUpperCase()}
                </Badge>
                {approved && (
                  <Badge className="bg-[var(--urus-success)] text-white border-none shrink-0">
                    Aprobado
                                </Badge>
                )}
                            </h1>
                        </div>
            {listRow && (
              <p className="text-xs text-muted-foreground flex items-center gap-2 truncate">
                Operación {listRow.operacion} · {String(listRow.variables.comprador)} ↔{" "}
                {String(listRow.variables.vendedor)}
              </p>
            )}
                    </div>
                </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 mr-1 bg-accent/30 px-2 py-1 rounded-md border border-border/30">
            <History className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-xs font-mono font-medium truncate max-w-[140px]">
              {docState.contractTemplateInput.templateVersion ?? "—"}
            </span>
                    </div>

          <AlertDialog open={approveOpen} onOpenChange={setApproveOpen}>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                className="gap-2 bg-[var(--urus-gold)] hover:bg-[var(--urus-gold)]/90 text-black border-none"
                disabled={approved || voiceBusy || phase === "error"}
              >
                <Send className="h-3.5 w-3.5" />
                Aprobar borrador
                    </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle>¿Aprobar este borrador?</AlertDialogTitle>
                <AlertDialogDescription>
                  Confirmas que el documento es correcto para el siguiente paso (firma digital). No podrás
                  enviar más instrucciones por voz hasta revertir.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleConfirmApprove}
                  className="bg-[var(--urus-gold)] text-black hover:bg-[var(--urus-gold)]/90"
                >
                  Confirmar aprobación
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {approved && (
            <Button type="button" variant="outline" size="sm" onClick={resetApproval}>
              Reabrir revisión
                    </Button>
          )}
                </div>
            </header>

      {phase === "error" && errorMessage && (
        <div
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-start gap-2"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Error</p>
            <p>{errorMessage}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-1 h-7 px-2"
              onClick={() => {
                dismissError();
                void reloadPreview();
              }}
            >
              Cerrar
                            </Button>
                        </div>
                    </div>
      )}

      {showApproveSuccess && (
        <div className="rounded-lg border border-[var(--urus-success)]/40 bg-[var(--urus-success)]/10 px-3 py-2 text-sm flex items-center gap-2 text-[var(--urus-success)]">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Borrador aprobado. Listo para el flujo de firma (cuando esté conectado).
                                    </div>
                                )}

      {lastPatch &&
        lastPatch.confidence < 0.65 &&
        !lastPatch.noOperationalChanges && (
          <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2">
            Confianza baja en la última interpretación ({Math.round(lastPatch.confidence * 100)}
            %). Revisa el resumen de cambios y el texto del contrato.
          </p>
        )}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,400px)] lg:gap-6">
        <DocxPreviewPanel
          contractTemplateInput={docState.contractTemplateInput}
          docxBase64={docState.docxBase64}
          docxFileName={docState.docxFileName}
          previewHtml={previewHtml}
          loading={phase === "loading_initial"}
          converting={phase === "converting_preview"}
        />

        <aside className="flex min-w-0 flex-col gap-4">
          <SmartClosingVoicePanel
            disabled={approved}
            busy={voiceBusy}
            onApplyTranscript={handleApplyTranscript}
          />

          {(appliedSummaries.length > 0 || validationIssues.length > 0) && (
            <Card className="border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden shrink-0">
              <CardHeader className="py-2 pb-0">
                <CardTitle className="text-sm flex items-center gap-2">
                  <History className="h-3.5 w-3.5" />
                  Última instrucción
                            </CardTitle>
                        </CardHeader>
              <CardContent className="pt-3 space-y-3">
                {appliedSummaries.length > 0 && (
                  <ul className="text-xs space-y-1 list-disc pl-4 text-muted-foreground">
                    {appliedSummaries.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                )}
                {validationIssues.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-destructive">Validación</p>
                    <ul className="text-xs space-y-1 list-disc pl-4 text-destructive/90">
                      {validationIssues.map((iss, i) => (
                        <li key={i}>
                          {iss.fieldPath}: {iss.message}
                        </li>
                      ))}
                    </ul>
                                </div>
                            )}
                        </CardContent>
                    </Card>
          )}

          <Card className="flex flex-col border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden">
            <CardHeader className="py-2 pb-0 shrink-0">
              <CardTitle className="text-sm">Resumen legal (payload)</CardTitle>
            </CardHeader>
            <ScrollArea className="h-[min(420px,50vh)] w-full min-h-[180px]">
              <CardContent className="pt-2 pr-4 pb-4">
                <PayloadSummaryFields
                  payload={docState.contractTemplateInput.payload}
                  disabled={approved || voiceBusy}
                  onCommit={commitPayloadFieldEdit}
                />
              </CardContent>
                        </ScrollArea>
                    </Card>
        </aside>
                </div>
            </div>
  );
}

export default function ContratoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const initialTemplate = useMemo(
    () => getContractTemplateFixtureByListId(resolvedParams.id),
    [resolvedParams.id],
  );

  if (!initialTemplate) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] gap-4">
        <p className="text-muted-foreground">No hay plantilla Smart Closing para este id.</p>
        <Button asChild variant="outline">
          <Link href="/legal/contratos">Volver al listado</Link>
        </Button>
        </div>
    );
  }

  return (
    <SmartClosingContractDetail contractListId={resolvedParams.id} initialTemplate={initialTemplate} />
    );
}
