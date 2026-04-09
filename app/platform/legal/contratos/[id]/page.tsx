"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  History,
  Loader2,
  Send,
} from "lucide-react";
import {
  AlertDialog,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DocxPreviewPanel } from "@/components/legal/smart-closing/docx-preview-panel";
import { PayloadSummaryFields } from "@/components/legal/smart-closing/payload-summary-fields";
import { SmartClosingVoicePanel } from "@/components/legal/smart-closing/voice-panel";
import { VersionHistoryPanel } from "@/components/legal/smart-closing/version-history-panel";
import {
  useSmartClosingSession,
  type SmartClosingVersioningContext,
  type SignatureSigner,
} from "@/components/legal/smart-closing/use-smart-closing-session";
import type { SmartClosingContractDetailDto } from "@/lib/legal/smart-closing/contracts-api";
import type { ContractTemplateInput } from "@/types/contracts";

function extractPrimarySignerName(input: ContractTemplateInput): string {
  switch (input.kind) {
    case "arras":
      return input.payload.buyers[0]?.fullName ?? "";
    case "senal_compra":
      return input.payload.purchaser.fullName;
    case "oferta_firme":
      return input.payload.offerers[0]?.fullName ?? "";
    default:
      return "";
  }
}

const KIND_LABEL: Record<string, string> = {
  arras: "Contrato de arras",
  senal_compra: "Señal de compra",
  oferta_firme: "Oferta en firme",
  anexo_mobiliario: "Anexo mobiliario",
};

function SmartClosingContractDetail({
  contract,
}: {
  contract: SmartClosingContractDetailDto;
}) {
  const initialTemplate = contract.contractTemplateInput;
  const versioningContext = useMemo<SmartClosingVersioningContext>(
    () => ({
      propertyCode: contract.propertyCode,
      operationId: contract.operationId,
      recordVersionEvent: true,
    }),
    [contract.operationId, contract.propertyCode],
  );
  const buyerParty = useMemo(
    () =>
      contract.parties.find((party) =>
        ["BUYER", "SIGNER", "PURCHASER", "OFFERER"].includes(party.role),
      ),
    [contract.parties],
  );
  const sellerParty = useMemo(
    () => contract.parties.find((party) => party.role === "SELLER"),
    [contract.parties],
  );

  const [approveOpen, setApproveOpen] = useState(false);

  const defaultSignerName = useMemo(
    () => extractPrimarySignerName(initialTemplate),
    [initialTemplate],
  );
  const [signerName, setSignerName] = useState(defaultSignerName);
  const [signerEmail, setSignerEmail] = useState("");
  const signerEmailRef = useRef<HTMLInputElement>(null);

  const [sellerName, setSellerName] = useState(sellerParty?.fullName ?? "");
  const [sellerEmail, setSellerEmail] = useState("");
  const [sellerPhone, setSellerPhone] = useState(sellerParty?.phone ?? "+34601257555");

  useEffect(() => {
    setSignerName(defaultSignerName);
  }, [defaultSignerName]);

  useEffect(() => {
    setSellerName(sellerParty?.fullName ?? "");
    setSellerEmail(sellerParty?.email ?? "");
    setSellerPhone(sellerParty?.phone ?? "+34601257555");
  }, [sellerParty]);

  const {
    phase,
    errorMessage,
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
    reloadPreview,
    commitPayloadFieldEdit,
    signaturePhase,
    signatureResult,
    signatureError,
    sendToSignature,
  } = useSmartClosingSession(initialTemplate, { versioningContext });

  const handleApplyTranscript = useCallback(
    async (transcript: string) => {
      await applyVoiceTranscript(transcript);
    },
    [applyVoiceTranscript],
  );

  const handleConfirmApproveAndSign = useCallback(async () => {
    const buyerN = signerName.trim();
    const buyerE = signerEmail.trim();
    if (!buyerN || !buyerE) return;

    await approveDraft();
    setApproveOpen(false);

    const signers: SignatureSigner[] = [
      { name: buyerN, email: buyerE, role: "BUYER" },
    ];

    const sn = sellerName.trim();
    const se = sellerEmail.trim();
    if (sn && se) {
      signers.push({
        name: sn,
        email: se,
        phone: sellerPhone.replace(/[^0-9]/g, ""),
        role: "SELLER",
      });
    }

    await sendToSignature(signers);
  }, [approveDraft, sendToSignature, signerName, signerEmail, sellerName, sellerEmail, sellerPhone]);

  const voiceBusy =
    phase === "applying_voice" || phase === "converting_preview" || phase === "loading_initial";

  const kindLabel = KIND_LABEL[docState.contractTemplateInput.kind] ?? "Contrato";

    return (
    <div className="flex min-h-0 flex-col gap-4 pb-6">
      <header className="flex items-center justify-between shrink-0 flex-wrap gap-3">
        <div className="flex items-center gap-4 min-w-0">
                    <Link href="/platform/legal/contratos">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold flex items-center gap-2 truncate">
                {kindLabel}
                <Badge variant="outline" className="font-mono font-normal text-xs shrink-0">
                  {contract.id.toUpperCase()}
                </Badge>
                {approved && signaturePhase !== "sent" && (
                  <Badge className="bg-[var(--urus-success)] text-white border-none shrink-0">
                    Aprobado
                  </Badge>
                )}
                {signaturePhase === "sent" && (
                  <Badge className="bg-blue-600 text-white border-none shrink-0">
                    Enviado a firma
                  </Badge>
                )}
              </h1>
                        </div>
            <p className="text-xs text-muted-foreground flex items-center gap-2 truncate">
              Operación {contract.operationId} · {(buyerParty?.fullName ?? defaultSignerName) || "—"} ↔{" "}
              {sellerParty?.fullName ?? "—"}
            </p>
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
                disabled={approved || voiceBusy || phase === "error" || signaturePhase === "sending"}
              >
                <Send className="h-3.5 w-3.5" />
                Aprobar y enviar a firma
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="max-w-lg">
              <AlertDialogHeader>
                <AlertDialogTitle>Aprobar y enviar a firma digital</AlertDialogTitle>
                <AlertDialogDescription>
                  Confirma los datos de los firmantes. El documento se enviará para
                  firma digital. No podrás enviar más instrucciones por voz hasta revertir.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-4 py-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Comprador</p>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="signer-name" className="text-sm">Nombre</Label>
                    <Input
                      id="signer-name"
                      value={signerName}
                      onChange={(e) => setSignerName(e.target.value)}
                      placeholder="Nombre completo del comprador"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signer-email" className="text-sm">Email</Label>
                    <Input
                      id="signer-email"
                      ref={signerEmailRef}
                      type="email"
                      value={signerEmail}
                      onChange={(e) => setSignerEmail(e.target.value)}
                      placeholder="comprador@ejemplo.com"
                    />
                  </div>
                </div>

                <hr className="border-border/30" />

                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vendedor</p>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="seller-name" className="text-sm">Nombre</Label>
                    <Input
                      id="seller-name"
                      value={sellerName}
                      onChange={(e) => setSellerName(e.target.value)}
                      placeholder="Nombre completo del vendedor"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="seller-email" className="text-sm">Email</Label>
                    <Input
                      id="seller-email"
                      type="email"
                      value={sellerEmail}
                      onChange={(e) => setSellerEmail(e.target.value)}
                      placeholder="vendedor@ejemplo.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm text-muted-foreground">Teléfono</Label>
                    <Input value={sellerPhone} disabled className="opacity-60" />
                  </div>
                </div>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <Button
                  onClick={handleConfirmApproveAndSign}
                  disabled={!signerName.trim() || !signerEmail.trim()}
                  className="bg-[var(--urus-gold)] text-black hover:bg-[var(--urus-gold)]/90"
                >
                  Confirmar y enviar a firma
                </Button>
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

      {signaturePhase === "sending" && (
        <div className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-sm flex items-center gap-2 text-blue-700 dark:text-blue-300">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          Subiendo documento y enviando a firma digital…
        </div>
      )}

      {signaturePhase === "sent" && signatureResult && (
        <div className="rounded-lg border border-[var(--urus-success)]/40 bg-[var(--urus-success)]/10 px-3 py-2 text-sm flex flex-col gap-1.5 text-[var(--urus-success)]">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Documento enviado a firma digital correctamente.
          </div>
          {signatureResult.signingUrl && (
            <a
              href={signatureResult.signingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs underline underline-offset-2 hover:opacity-80"
            >
              <ExternalLink className="h-3 w-3" />
              Abrir enlace de firma
            </a>
          )}
          <p className="text-xs text-muted-foreground">
            ID: {signatureResult.signatureRequestId}
            {signatureResult.normalizedToPdf && " · Convertido a PDF"}
          </p>
        </div>
      )}

      {signaturePhase === "error" && signatureError && (
        <div
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-start gap-2"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Error al enviar a firma</p>
            <p>{signatureError}</p>
          </div>
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

      {clarificationQuestions.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-sm">
          <p className="font-medium text-amber-800 dark:text-amber-300">
            Hace falta aclarar la instrucción antes de modificar el contrato.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-amber-700 dark:text-amber-400">
            {clarificationQuestions.map((question, index) => (
              <li key={index}>{question}</li>
            ))}
          </ul>
        </div>
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

          {versioningContext?.propertyCode && (
            <VersionHistoryPanel contractId={contract.id} />
          )}
        </aside>
                </div>
            </div>
  );
}

export default function ContratoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const [contract, setContract] = useState<SmartClosingContractDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setLoadError(null);

      try {
        const response = await fetch(`/api/contracts/${resolvedParams.id}`);
        const data = (await response.json()) as SmartClosingContractDetailDto & { error?: string };

        if (!response.ok) {
          throw new Error(data.error ?? `Error HTTP ${response.status}`);
        }

        if (!cancelled) {
          setContract(data);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "No se pudo cargar el contrato");
          setContract(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resolvedParams.id]);

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando contrato real...
      </div>
    );
  }

  if (loadError || !contract) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] gap-4">
        <p className="text-muted-foreground">
          {loadError ?? "No se encontró un contrato persistido para este id."}
        </p>
        <Button asChild variant="outline">
          <Link href="/platform/legal/contratos">Volver al listado</Link>
        </Button>
      </div>
    );
  }

  return <SmartClosingContractDetail contract={contract} />;
}
