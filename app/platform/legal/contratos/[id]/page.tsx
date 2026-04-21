"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileText,
  History,
  Loader2,
  MessageSquare,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DocxPreviewPanel } from "@/components/legal/smart-closing/docx-preview-panel";
import { PayloadSummaryFields } from "@/components/legal/smart-closing/payload-summary-fields";
import { SmartClosingVoicePanel } from "@/components/legal/smart-closing/voice-panel";
import { VersionHistoryPanel } from "@/components/legal/smart-closing/version-history-panel";
import { AdditionalClausesEditor } from "@/components/legal/smart-closing/additional-clauses-editor";
import {
  useSmartClosingSession,
  type SmartClosingVersioningContext,
  type SignatureSigner,
} from "@/components/legal/smart-closing/use-smart-closing-session";
import type { SmartClosingContractDetailDto } from "@/lib/legal/smart-closing/contracts-api";
import type { ContractTemplateInput } from "@/types/contracts";
import type { AdditionalClausesDoc } from "@/lib/contracts/additional-clauses/types";
import { cn } from "@/lib/utils";

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

type SidebarTab = "assistant" | "data" | "history";

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
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("assistant");

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
    assistantMessage,
    missingDataQuestions,
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
    applyAdditionalClausesDoc,
    currentAdditionalClausesDoc,
  } = useSmartClosingSession(initialTemplate, {
    versioningContext,
    initialAdditionalClausesDoc: contract.additionalClausesDoc,
  });

  const clausesRerenderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleClausesPersisted = useCallback(
    (_updatedAt: string | null, doc: AdditionalClausesDoc | null) => {
      if (clausesRerenderTimerRef.current) {
        clearTimeout(clausesRerenderTimerRef.current);
      }
      clausesRerenderTimerRef.current = setTimeout(() => {
        void applyAdditionalClausesDoc(doc);
      }, 300);
    },
    [applyAdditionalClausesDoc],
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
    <div className="flex min-h-0 flex-col h-[calc(100vh-64px)]">
      {/* ── Compact header ── */}
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-950/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/platform/legal/contratos">
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold truncate flex items-center gap-2">
              {kindLabel}
              <span className="text-[11px] font-mono text-muted-foreground font-normal">
                {contract.id.slice(0, 8).toUpperCase()}
              </span>
              {approved && signaturePhase !== "sent" && (
                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 text-[10px] px-1.5 py-0">
                  Aprobado
                </Badge>
              )}
              {signaturePhase === "sent" && (
                <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20 text-[10px] px-1.5 py-0">
                  Enviado a firma
                </Badge>
              )}
            </h1>
            <p className="text-[11px] text-muted-foreground truncate">
              {(buyerParty?.fullName ?? defaultSignerName) || "—"} · {sellerParty?.fullName ?? "—"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded border border-border/40">
            {docState.contractTemplateInput.templateVersion ?? "—"}
          </span>

          <AlertDialog open={approveOpen} onOpenChange={setApproveOpen}>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                className="h-7 gap-1.5 text-xs bg-[var(--urus-gold)] hover:bg-[var(--urus-gold)]/90 text-black border-none"
                disabled={approved || voiceBusy || phase === "error" || signaturePhase === "sending"}
              >
                <Send className="h-3 w-3" />
                Enviar a firma
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="max-w-lg">
              <AlertDialogHeader>
                <AlertDialogTitle>Aprobar y enviar a firma digital</AlertDialogTitle>
                <AlertDialogDescription>
                  Confirma los datos de los firmantes. El documento se enviara para
                  firma digital.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-4 py-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Comprador</p>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="signer-name" className="text-sm">Nombre</Label>
                    <Input id="signer-name" value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Nombre completo del comprador" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signer-email" className="text-sm">Email</Label>
                    <Input id="signer-email" ref={signerEmailRef} type="email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} placeholder="comprador@ejemplo.com" />
                  </div>
                </div>
                <hr className="border-border/30" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vendedor</p>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="seller-name" className="text-sm">Nombre</Label>
                    <Input id="seller-name" value={sellerName} onChange={(e) => setSellerName(e.target.value)} placeholder="Nombre completo del vendedor" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="seller-email" className="text-sm">Email</Label>
                    <Input id="seller-email" type="email" value={sellerEmail} onChange={(e) => setSellerEmail(e.target.value)} placeholder="vendedor@ejemplo.com" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm text-muted-foreground">Telefono</Label>
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
                  Confirmar y enviar
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {approved && (
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={resetApproval}>
              Reabrir
            </Button>
          )}
        </div>
      </header>

      {/* ── Status banners (compact) ── */}
      <div className="shrink-0 px-4 space-y-1.5 empty:hidden pt-2">
        {phase === "error" && errorMessage && (
          <div className="rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-center gap-2" role="alert">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 truncate">{errorMessage}</span>
            <Button type="button" variant="ghost" size="sm" className="h-5 px-1.5 text-[10px]" onClick={() => { dismissError(); void reloadPreview(); }}>
              Cerrar
            </Button>
          </div>
        )}

        {signaturePhase === "sending" && (
          <div className="rounded-md border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-xs flex items-center gap-2 text-blue-700 dark:text-blue-400">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            Enviando a firma digital...
          </div>
        )}

        {signaturePhase === "sent" && signatureResult && (
          <div className="rounded-md border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span>Enviado a firma.</span>
            {signatureResult.signingUrl && (
              <a href={signatureResult.signingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline underline-offset-2">
                <ExternalLink className="h-3 w-3" /> Abrir
              </a>
            )}
          </div>
        )}

        {signaturePhase === "error" && signatureError && (
          <div className="rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-center gap-2" role="alert">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {signatureError}
          </div>
        )}

        {lastPatch && lastPatch.confidence < 0.5 && !lastPatch.noOperationalChanges && (
          <div className="rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            Confianza baja ({Math.round(lastPatch.confidence * 100)}%). Revisa los cambios.
          </div>
        )}
      </div>

      {/* ── Main 2-column layout ── */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-0">

        {/* Left: Document */}
        <div className="min-h-0 flex flex-col border-r border-neutral-200 dark:border-neutral-800">
          <DocxPreviewPanel
            contractTemplateInput={docState.contractTemplateInput}
            docxBase64={docState.docxBase64}
            docxFileName={docState.docxFileName}
            previewHtml={previewHtml}
            loading={phase === "loading_initial"}
            converting={phase === "converting_preview"}
          />

          <AdditionalClausesEditor
            contractId={contract.id}
            initialDoc={currentAdditionalClausesDoc ?? contract.additionalClausesDoc}
            readOnly={approved || contract.status !== "DRAFT"}
            onPersisted={handleClausesPersisted}
          />
        </div>

        {/* Right: Sidebar with tabs */}
        <aside className="min-h-0 flex flex-col bg-white dark:bg-neutral-950">
          {/* Tab bar */}
          <div className="flex border-b border-neutral-200 dark:border-neutral-800 shrink-0">
            {([
              { id: "assistant" as const, icon: MessageSquare, label: "Asistente" },
              { id: "data" as const, icon: ClipboardList, label: "Datos" },
              { id: "history" as const, icon: History, label: "Historial" },
            ]).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSidebarTab(tab.id)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-medium transition-colors border-b-2 -mb-px",
                  sidebarTab === tab.id
                    ? "border-neutral-900 dark:border-white text-neutral-900 dark:text-white"
                    : "border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300",
                )}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {/* ── Asistente tab ── */}
            {sidebarTab === "assistant" && (
              <div className="h-full flex flex-col">
                <SmartClosingVoicePanel
                  disabled={approved}
                  busy={voiceBusy}
                  onApplyTranscript={applyVoiceTranscript}
                  assistantMessage={assistantMessage}
                  missingDataQuestions={missingDataQuestions}
                  clarificationQuestions={clarificationQuestions}
                  appliedSummaries={appliedSummaries}
                />
              </div>
            )}

            {/* ── Datos tab ── */}
            {sidebarTab === "data" && (
              <ScrollArea className="h-full">
                <div className="p-4 space-y-4">
                  {(appliedSummaries.length > 0 || validationIssues.length > 0) && (
                    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                      <div className="px-3 py-2 bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
                        <p className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wide">Ultimo cambio</p>
                      </div>
                      <div className="px-3 py-2.5 space-y-2">
                        {appliedSummaries.length > 0 && (
                          <ul className="text-[11px] space-y-0.5 list-disc pl-3.5 text-neutral-600 dark:text-neutral-400">
                            {appliedSummaries.map((s, i) => <li key={i}>{s}</li>)}
                          </ul>
                        )}
                        {validationIssues.length > 0 && (
                          <ul className="text-[11px] space-y-0.5 list-disc pl-3.5 text-red-600 dark:text-red-400">
                            {validationIssues.map((iss, i) => (
                              <li key={i}>{iss.fieldPath}: {iss.message}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wide mb-2">
                      Datos del contrato
                    </p>
                    <PayloadSummaryFields
                      payload={docState.contractTemplateInput.payload}
                      disabled={approved || voiceBusy}
                      onCommit={commitPayloadFieldEdit}
                    />
                  </div>
                </div>
              </ScrollArea>
            )}

            {/* ── Historial tab ── */}
            {sidebarTab === "history" && (
              <ScrollArea className="h-full">
                <div className="p-4">
                  {versioningContext?.propertyCode ? (
                    <VersionHistoryPanel contractId={contract.id} />
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-8">
                      Sin historial disponible
                    </p>
                  )}
                </div>
              </ScrollArea>
            )}
          </div>
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
        Cargando contrato...
      </div>
    );
  }

  if (loadError || !contract) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] gap-4">
        <p className="text-muted-foreground">
          {loadError ?? "No se encontro un contrato para este id."}
        </p>
        <Button asChild variant="outline">
          <Link href="/platform/legal/contratos">Volver al listado</Link>
        </Button>
      </div>
    );
  }

  return <SmartClosingContractDetail contract={contract} />;
}
