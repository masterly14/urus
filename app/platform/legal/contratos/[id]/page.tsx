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
import { SmartClosingVoicePanel } from "@/components/legal/smart-closing/voice-panel";
import { VersionHistoryPanel } from "@/components/legal/smart-closing/version-history-panel";
import { InlineSectionAddendumEditor } from "@/components/legal/smart-closing/inline-section-addendum-editor";
import { InlineAdditionalClauseEditor } from "@/components/legal/smart-closing/inline-additional-clause-editor";
import { InlinePayloadFieldEditor } from "@/components/legal/smart-closing/inline-payload-field-editor";
import {
  buildClauseHeadingText,
  getDefaultAdditionalClauseStartNumber,
  getNextAdditionalClauseNumber,
  listAdditionalClauseSegments,
  removeAdditionalClauseByNumber,
} from "@/lib/contracts/additional-clauses/clause-numbering";
import {
  useSmartClosingSession,
  type SmartClosingVersioningContext,
  type SignatureSigner,
} from "@/components/legal/smart-closing/use-smart-closing-session";
import type { SmartClosingContractDetailDto } from "@/lib/legal/smart-closing/contracts-api";
import type { ContractTemplateInput } from "@/types/contracts";
import {
  isAdditionalClausesDocEmpty,
  type AdditionalClausesDoc,
} from "@/lib/contracts/additional-clauses/types";
import type {
  SectionAddendum,
  SectionAddendumsList,
} from "@/lib/contracts/section-addendums/types";
import { cn } from "@/lib/utils";

function generateLocalAddendumId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `addendum_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getAddendumPreviewText(addendum: SectionAddendum): string {
  const text = (addendum.contentDoc.content ?? [])
    .map((block) => {
      if (block.type === "paragraph") {
        return (block.content ?? [])
          .filter((n) => n.type === "text")
          .map((n) => n.text ?? "")
          .join(" ");
      }
      return "";
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "Detalle sin texto";
  return text.length > 96 ? `${text.slice(0, 96)}...` : text;
}

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

type SidebarTab = "assistant" | "history";

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
    applySectionAddendums,
    currentSectionAddendums,
    previewFieldAnchors,
  } = useSmartClosingSession(initialTemplate, {
    contractId: contract.id,
    contractStatus: contract.status,
    versioningContext,
    initialAdditionalClausesDoc: contract.additionalClausesDoc,
    initialSectionAddendums: contract.sectionAddendums,
  });

  const startingClauseNumber = useMemo(
    () => getDefaultAdditionalClauseStartNumber(docState.contractTemplateInput),
    [docState.contractTemplateInput],
  );

  const getCurrentAdditionalClausesDoc = useCallback(
    () => currentAdditionalClausesDoc ?? contract.additionalClausesDoc,
    [contract.additionalClausesDoc, currentAdditionalClausesDoc],
  );
  const getCurrentSectionAddendums = useCallback(
    () => (currentSectionAddendums ?? contract.sectionAddendums) as SectionAddendumsList,
    [contract.sectionAddendums, currentSectionAddendums],
  );
  const currentAdditionalClauses = useMemo(
    () => listAdditionalClauseSegments(getCurrentAdditionalClausesDoc()),
    [getCurrentAdditionalClausesDoc],
  );

  const canEditSectionDetails = !approved && contract.status === "DRAFT";
  const canEditAdditionalClauses = canEditSectionDetails;

  const handleInlineClauseSave = useCallback(
    async (title: string, contentDoc: AdditionalClausesDoc) => {
      const currentDoc = getCurrentAdditionalClausesDoc();
      const nextClauseNumber = getNextAdditionalClauseNumber(currentDoc, startingClauseNumber);
      const headingText = buildClauseHeadingText(nextClauseNumber, title);

      const baseBlocks =
        currentDoc && !isAdditionalClausesDocEmpty(currentDoc)
          ? (currentDoc.content ?? [])
          : [];

      const nextDoc: AdditionalClausesDoc = {
        type: "doc",
        content: [
          ...baseBlocks,
          {
            type: "paragraph",
            content: [{ type: "text", text: headingText, marks: [{ type: "bold" }] }],
          },
          { type: "paragraph" },
          ...(contentDoc.content ?? []),
        ],
      };

      const response = await fetch(`/api/contracts/${contract.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ additionalClausesDoc: nextDoc }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Error HTTP ${response.status}`);
      }

      await applyAdditionalClausesDoc(nextDoc);
    },
    [applyAdditionalClausesDoc, contract.id, getCurrentAdditionalClausesDoc, startingClauseNumber],
  );
  const handleInlineClauseDelete = useCallback(
    async (clauseNumber: number) => {
      const currentDoc = getCurrentAdditionalClausesDoc();
      const nextDoc = removeAdditionalClauseByNumber(currentDoc, clauseNumber);

      const response = await fetch(`/api/contracts/${contract.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ additionalClausesDoc: nextDoc }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Error HTTP ${response.status}`);
      }

      await applyAdditionalClausesDoc(nextDoc);
    },
    [applyAdditionalClausesDoc, contract.id, getCurrentAdditionalClausesDoc],
  );
  const handleDeleteClauseFromPreview = useCallback(
    async (clauseNumber: number) => {
      const confirmed = window.confirm(
        `¿Seguro que quieres eliminar la cláusula ${clauseNumber}?`,
      );
      if (!confirmed) return;
      await handleInlineClauseDelete(clauseNumber);
    },
    [handleInlineClauseDelete],
  );
  const handleInlineAddendumSave = useCallback(
    async (sectionId: string, contentDoc: AdditionalClausesDoc) => {
      const baseList = getCurrentSectionAddendums();
      const nextList: SectionAddendumsList = [
        ...baseList,
        {
          id: generateLocalAddendumId(),
          sectionId,
          type: "notes",
          contentDoc,
          updatedAtIso: new Date().toISOString(),
        },
      ];

      const response = await fetch(`/api/contracts/${contract.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionAddendums: nextList }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Error HTTP ${response.status}`);
      }

      await applySectionAddendums(nextList);
    },
    [applySectionAddendums, contract.id, getCurrentSectionAddendums],
  );
  const handleInlineAddendumDelete = useCallback(
    async (sectionId: string, addendumId: string) => {
      const baseList = getCurrentSectionAddendums();
      const nextList = baseList.filter(
        (item) => !(item.sectionId === sectionId && item.id === addendumId),
      );

      const response = await fetch(`/api/contracts/${contract.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionAddendums: nextList }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Error HTTP ${response.status}`);
      }

      await applySectionAddendums(nextList);
    },
    [applySectionAddendums, contract.id, getCurrentSectionAddendums],
  );

  const handleConfirmApproveAndSign = useCallback(async () => {
    const buyerN = signerName.trim();
    const buyerE = signerEmail.trim();
    if (!buyerN || !buyerE) return;

    const approvedPersisted = await approveDraft();
    if (!approvedPersisted) return;
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
      <header className="flex items-center justify-between border-b border-border bg-background/90 px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/platform/legal/contratos">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
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
                <Badge className="bg-urus-success/15 text-urus-success border-urus-success/20 text-[10px] px-1.5 py-0">
                  Aprobado
                </Badge>
              )}
              {signaturePhase === "sent" && (
                <Badge className="bg-[var(--urus-info)]/15 text-[var(--urus-info)] border-[var(--urus-info)]/20 text-[10px] px-1.5 py-0">
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
                variant="default"
                className="h-7 gap-1.5 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
                  variant="default"
                  className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
          <div className="rounded-md border border-urus-danger/20 bg-urus-danger/5 px-3 py-2 text-xs text-urus-danger flex items-center gap-2" role="alert">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 truncate">{errorMessage}</span>
            <Button type="button" variant="ghost" size="sm" className="h-5 px-1.5 text-[10px]" onClick={() => { dismissError(); void reloadPreview(); }}>
              Cerrar
            </Button>
          </div>
        )}

        {signaturePhase === "sending" && (
          <div className="rounded-md border border-urus-info/20 bg-urus-info/5 px-3 py-2 text-xs flex items-center gap-2 text-urus-info">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            Enviando a firma digital...
          </div>
        )}

        {signaturePhase === "sent" && signatureResult && (
          <div className="rounded-md border border-urus-success/20 bg-urus-success/5 px-3 py-2 text-xs text-urus-success flex items-center gap-2">
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
          <div className="rounded-md border border-urus-danger/20 bg-urus-danger/5 px-3 py-2 text-xs text-urus-danger flex items-center gap-2" role="alert">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {signatureError}
          </div>
        )}

        {lastPatch && lastPatch.confidence < 0.5 && !lastPatch.noOperationalChanges && (
          <div className="rounded-md border border-urus-warning/20 bg-urus-warning/5 px-3 py-2 text-xs text-urus-warning flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            Confianza baja ({Math.round(lastPatch.confidence * 100)}%). Revisa los cambios.
          </div>
        )}
      </div>

      {/* ── Main 2-column layout ── */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-0">

        {/* Left: Document */}
        <div className="min-h-0 flex flex-col border-r border-border">
          <DocxPreviewPanel
            contractTemplateInput={docState.contractTemplateInput}
            docxBase64={docState.docxBase64}
            docxFileName={docState.docxFileName}
            previewHtml={previewHtml}
            loading={phase === "loading_initial"}
            converting={phase === "converting_preview"}
            previewFieldAnchors={previewFieldAnchors}
            onDeleteClauseClick={
              canEditAdditionalClauses ? handleDeleteClauseFromPreview : undefined
            }
            onInlineFieldSave={
              canEditSectionDetails ? commitPayloadFieldEdit : undefined
            }
            renderInlineEditor={
              canEditSectionDetails
                ? (sectionId, onClose) => (
                    <InlineSectionAddendumEditor
                      sectionId={sectionId}
                      existingDetails={getCurrentSectionAddendums()
                        .filter((item) => item.sectionId === sectionId)
                        .map((item) => ({
                          id: item.id,
                          previewText: getAddendumPreviewText(item),
                        }))}
                      onClose={onClose}
                      onSave={handleInlineAddendumSave}
                      onDelete={handleInlineAddendumDelete}
                    />
                  )
                : undefined
            }
            renderInlineFieldEditor={
              canEditSectionDetails
                ? (anchor, onClose) => (
                    <InlinePayloadFieldEditor
                      anchor={anchor}
                      onClose={onClose}
                      onSave={commitPayloadFieldEdit}
                    />
                  )
                : undefined
            }
            renderClauseInlineEditor={
              canEditAdditionalClauses
                ? (onClose) => (
                    <InlineAdditionalClauseEditor
                      clauseNumber={getNextAdditionalClauseNumber(
                        getCurrentAdditionalClausesDoc(),
                        startingClauseNumber,
                      )}
                      existingClauses={currentAdditionalClauses.map((clause) => ({
                        number: clause.number,
                        headingText: clause.headingText,
                      }))}
                      onClose={onClose}
                      onSave={handleInlineClauseSave}
                      onDelete={handleInlineClauseDelete}
                    />
                  )
                : undefined
            }
          />
        </div>

        {/* Right: Sidebar with tabs */}
        <aside className="min-h-0 flex flex-col bg-background">
          {/* Tab bar */}
          <div className="flex border-b border-border shrink-0">
            {([
              { id: "assistant" as const, icon: MessageSquare, label: "Asistente" },
              { id: "history" as const, icon: History, label: "Historial" },
            ]).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSidebarTab(tab.id)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-medium transition-colors border-b-2 -mb-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  sidebarTab === tab.id
                    ? "border-primary text-foreground bg-accent/30"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/20",
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
