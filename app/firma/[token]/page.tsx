"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import SignatureCanvas from "react-signature-canvas";
import {
  CheckCircle2,
  Eraser,
  FileText,
  KeyRound,
  Loader2,
  PenLine,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface FirmaMetadata {
  operationId: string;
  documentKind: string;
  signerName: string;
  signerEmail: string;
  status: string;
  isTerminal: boolean;
  hasPhone: boolean;
  phoneMasked: string | null;
  pdfUrl: string;
  signedDocumentUrl: string | null;
  sentAt: string;
  completedAt: string | null;
  parties: { fullName: string; role: string; email: string }[];
}

interface SignResult {
  status: string;
  signedDocumentUrl: string;
  auditTrailUrl: string;
}

type FirmaStep =
  | "review"
  | "otp_sending"
  | "otp_input"
  | "otp_verifying"
  | "awaiting_signature"
  | "signing"
  | "done"
  | "declined";

const KIND_LABEL: Record<string, string> = {
  arras: "Contrato de arras",
  senal_compra: "Señal de compra",
  oferta_firme: "Oferta en firme",
  anexo_mobiliario: "Anexo mobiliario",
};

const CONSENT_TEXT =
  "Al hacer clic en Firmar, declaro que he leído y acepto el contenido íntegro del presente documento. " +
  "Confirmo que actúo en mi propio nombre y que los datos proporcionados son veraces.";

/** Vista previa de diseño sin backend: `/firma/{cualquier-token}?mock=1` o `?uiMock=1` */
const MOCK_FIRMA_METADATA: FirmaMetadata = {
  operationId: "OP-2026-MOCK-001",
  documentKind: "arras",
  signerName: "María Ejemplo García",
  signerEmail: "maria.ejemplo@demo.local",
  status: "SENT",
  isTerminal: false,
  hasPhone: true,
  phoneMasked: "***1234",
  pdfUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
  signedDocumentUrl: null,
  sentAt: new Date().toISOString(),
  completedAt: null,
  parties: [
    {
      fullName: "María Ejemplo García",
      role: "BUYER",
      email: "maria.ejemplo@demo.local",
    },
  ],
};

const MOCK_OTP_ID = "mock-otp-preview";

function readUiMockFromSearch(): boolean {
  if (typeof window === "undefined") return false;
  const q = new URLSearchParams(window.location.search);
  const m = q.get("mock");
  const u = q.get("uiMock");
  return (
    m === "1" ||
    m === "true" ||
    u === "1" ||
    u === "true"
  );
}

export default function FirmaPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  /** null = aún no hidratado (cliente); evita parpadeo API vs mock */
  const [isUiMock, setIsUiMock] = useState<boolean | null>(null);

  useEffect(() => {
    setIsUiMock(readUiMockFromSearch());
  }, []);

  const sigCanvasRef = useRef<SignatureCanvas | null>(null);
  const [meta, setMeta] = useState<FirmaMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SignResult | null>(null);
  const [hasSig, setHasSig] = useState(false);

  const [step, setStep] = useState<FirmaStep>("review");
  /** Tras OTP correcto; permite reabrir el modal de firma sin repetir SMS */
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpId, setOtpId] = useState<string | null>(null);
  const [otpPhone, setOtpPhone] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);

  useEffect(() => {
    if (isUiMock === null) return;

    if (isUiMock) {
      setMeta({ ...MOCK_FIRMA_METADATA });
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const res = await fetch(`/api/firma/${token}`);
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          setError(data?.error ?? `Error ${res.status}`);
          return;
        }
        setMeta(await res.json());
      } catch {
        setError("Error de conexión");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token, isUiMock]);

  const clearSignature = useCallback(() => {
    sigCanvasRef.current?.clear();
    setHasSig(false);
  }, []);

  const handleRequestOtp = useCallback(async () => {
    setStep("otp_sending");
    setError(null);
    setOtpError(null);

    if (isUiMock === true) {
      await new Promise((r) => setTimeout(r, 450));
      setOtpId(MOCK_OTP_ID);
      setOtpPhone(MOCK_FIRMA_METADATA.phoneMasked);
      setOtpCode("");
      setStep("otp_input");
      return;
    }

    try {
      const res = await fetch(`/api/firma/${token}/otp/send`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? `Error ${res.status}`);
        setStep("review");
        return;
      }
      setOtpId(data.otpId);
      setOtpPhone(data.phoneMasked);
      setOtpCode("");
      setStep("otp_input");
    } catch {
      setError("Error de conexión al enviar el código");
      setStep("review");
    }
  }, [token, isUiMock]);

  const handleVerifyOtp = useCallback(async () => {
    if (!otpId || otpCode.length !== 6) return;

    setStep("otp_verifying");
    setOtpError(null);

    if (isUiMock === true) {
      await new Promise((r) => setTimeout(r, 400));
      setOtpVerified(true);
      setOtpCode("");
      setStep("awaiting_signature");
      return;
    }

    try {
      const res = await fetch(`/api/firma/${token}/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otpId, code: otpCode }),
      });
      const data = await res.json();

      if (!data.verified) {
        setOtpError(data.error ?? "Código incorrecto");
        setStep("otp_input");
        return;
      }

      setOtpVerified(true);
      setOtpCode("");
      setStep("awaiting_signature");
    } catch {
      setOtpError("Error de conexión al verificar");
      setStep("otp_input");
    }
  }, [token, otpId, otpCode, isUiMock]);

  const handleResendOtp = useCallback(async () => {
    setOtpCode("");
    setOtpError(null);
    setStep("otp_sending");

    if (isUiMock === true) {
      await new Promise((r) => setTimeout(r, 350));
      setOtpId(MOCK_OTP_ID);
      setOtpPhone(MOCK_FIRMA_METADATA.phoneMasked);
      setStep("otp_input");
      return;
    }

    try {
      const res = await fetch(`/api/firma/${token}/otp/send`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setOtpError(data?.error ?? "Error al reenviar");
        setStep("otp_input");
        return;
      }
      setOtpId(data.otpId);
      setOtpPhone(data.phoneMasked);
      setStep("otp_input");
    } catch {
      setOtpError("Error de conexión al reenviar");
      setStep("otp_input");
    }
  }, [token, isUiMock]);

  const executeSign = useCallback(async () => {
    if (!sigCanvasRef.current || sigCanvasRef.current.isEmpty()) {
      setError("Dibuja tu firma en el recuadro antes de finalizar.");
      return;
    }
    setError(null);
    setStep("signing");
    try {
      const signatureImageBase64 = sigCanvasRef.current
        .getTrimmedCanvas()
        .toDataURL("image/png")
        .replace(/^data:image\/png;base64,/, "");

      if (isUiMock === true) {
        await new Promise((r) => setTimeout(r, 600));
        const mockPdf = MOCK_FIRMA_METADATA.pdfUrl;
        setResult({
          status: "COMPLETED",
          signedDocumentUrl: mockPdf,
          auditTrailUrl: mockPdf,
        });
        setStep("done");
        return;
      }

      const res = await fetch(`/api/firma/${token}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureImageBase64, otpId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? `Error ${res.status}`);
        setStep("awaiting_signature");
        return;
      }
      setResult(data);
      setStep("done");
    } catch {
      setError("Error de conexión al firmar");
      setStep("awaiting_signature");
    }
  }, [token, otpId, isUiMock]);

  const [declineReason, setDeclineReason] = useState("");
  const [declining, setDeclining] = useState(false);

  const handleDecline = useCallback(async () => {
    setDeclining(true);
    setError(null);

    if (isUiMock === true) {
      await new Promise((r) => setTimeout(r, 500));
      setStep("declined");
      setDeclining(false);
      return;
    }

    try {
      const res = await fetch(`/api/firma/${token}/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: declineReason.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? `Error ${res.status}`);
        setDeclining(false);
        return;
      }
      setStep("declined");
    } catch {
      setError("Error de conexión al rechazar la firma");
    } finally {
      setDeclining(false);
    }
  }, [token, declineReason, isUiMock]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !meta) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <ShieldAlert className="mx-auto h-12 w-12 text-destructive mb-4" />
            <p className="text-lg font-medium text-destructive">{error}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              El enlace de firma no es válido o ha expirado.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!meta) return null;

  const kindLabel = KIND_LABEL[meta.documentKind] ?? meta.documentKind;
  const isTerminalOrDone = meta.isTerminal || step === "done" || step === "declined";
  const isDeclined = meta.status === "DECLINED" || step === "declined";

  const signatureModalOpen = step === "awaiting_signature" || step === "signing";

  return (
    <div className="min-h-screen bg-[hsl(222_47%_7%)] text-foreground">
      <header className="border-b border-border/60 bg-background/90 backdrop-blur-md sticky top-0 z-20">
        <div className="flex flex-col gap-1 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-primary/40 bg-primary/10">
              <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                Urus Capital · Firma electrónica avanzada
              </p>
              <p className="text-sm font-semibold tracking-tight">Acto de firma documental</p>
            </div>
          </div>
          <span className="font-mono text-xs text-muted-foreground md:text-right">
            Ref. {meta.operationId}
          </span>
        </div>
        {isUiMock === true && (
          <div className="border-t border-amber-500/30 bg-amber-950/50 text-amber-100">
            <p className="px-4 py-2 text-center text-xs font-medium md:px-8">
              Vista previa (mock): datos y PDF de demostración. Añade{" "}
              <code className="rounded bg-amber-900/80 px-1">?mock=1</code> o{" "}
              <code className="rounded bg-amber-900/80 px-1">?uiMock=1</code> a la URL.
            </p>
          </div>
        )}
      </header>

      <div className="border-b border-border/50 bg-card/20">
        <div className="flex flex-col gap-3 px-4 py-5 md:flex-row md:items-end md:justify-between md:px-8">
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Documento sujeto a firma
            </p>
            <h1 className="font-serif text-2xl font-semibold tracking-tight text-balance md:text-3xl">
              {kindLabel}
            </h1>
          </div>
          <div className="text-left md:text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Expediente</p>
            <p className="font-mono text-sm">{meta.operationId}</p>
          </div>
        </div>
      </div>

      <main className="w-full">
        <div className="w-full bg-muted/15">
          <iframe
            src={meta.pdfUrl}
            className="block w-full border-0 bg-background"
            style={{ minHeight: "70vh", height: "calc(100vh - 14rem)" }}
            title="Documento a firmar"
          />
        </div>

        {isTerminalOrDone ? (
          <div className="mx-auto max-w-2xl px-4 py-10 md:px-8">
            {isDeclined ? (
              <Card className="border-red-500/35 bg-red-950/25">
                <CardContent className="space-y-3 pt-8 text-center">
                  <XCircle className="mx-auto h-10 w-10 text-red-500" />
                  <p className="text-lg font-semibold text-red-400">Firma rechazada</p>
                  <p className="text-sm text-muted-foreground">
                    Has indicado que no deseas firmar este documento. El equipo de Urus Capital ha sido
                    notificado.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-emerald-500/35 bg-emerald-950/20">
                <CardContent className="space-y-3 pt-8 text-center">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
                  <p className="text-lg font-semibold text-emerald-400">Documento firmado</p>
                  <p className="text-sm text-muted-foreground">
                    {meta.completedAt || result
                      ? `Firmado el ${new Date(meta.completedAt ?? new Date().toISOString()).toLocaleDateString("es-ES")}`
                      : "La firma se ha completado correctamente."}
                  </p>
                  {(result?.signedDocumentUrl ?? meta.signedDocumentUrl) && (
                    <a
                      href={result?.signedDocumentUrl ?? meta.signedDocumentUrl!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block text-sm font-medium text-primary underline underline-offset-4"
                    >
                      Descargar documento firmado
                    </a>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <section className="border-t border-border/40 bg-background/80 backdrop-blur-sm">
            <div className="mx-auto max-w-2xl space-y-8 px-4 py-10 md:px-8">
              <Card className="border-border/80 bg-card/60 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 font-serif text-base">
                    <FileText className="h-4 w-4 text-primary" />
                    Datos del firmante
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Nombre</p>
                    <p className="font-medium">{meta.signerName}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Email</p>
                    <p className="font-medium break-all">{meta.signerEmail}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Documento</p>
                    <p className="font-medium">{kindLabel}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Enviado</p>
                    <p className="font-medium">{new Date(meta.sentAt).toLocaleDateString("es-ES")}</p>
                  </div>
                </CardContent>
              </Card>

              {(step === "otp_sending" || step === "otp_input" || step === "otp_verifying") && (
                <Card className="border-primary/25 bg-primary/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <KeyRound className="h-4 w-4" />
                      Verificación por SMS
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {step === "otp_sending" ? (
                      <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Enviando código al teléfono registrado…
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Smartphone className="h-4 w-4 shrink-0" />
                          <span>Código enviado al {otpPhone ?? "teléfono registrado"}</span>
                        </div>
                        <Input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={6}
                          placeholder="• • • • • •"
                          className="text-center text-2xl tracking-[0.45em] font-mono"
                          value={otpCode}
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                            setOtpCode(v);
                            setOtpError(null);
                          }}
                          disabled={step === "otp_verifying"}
                          autoFocus
                        />
                        {otpError && <p className="text-sm text-destructive">{otpError}</p>}
                        <Button
                          className="w-full"
                          size="lg"
                          onClick={handleVerifyOtp}
                          disabled={otpCode.length !== 6 || step === "otp_verifying"}
                        >
                          {step === "otp_verifying" ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Verificando…
                            </>
                          ) : (
                            "Confirmar código"
                          )}
                        </Button>
                        <button
                          type="button"
                          className="flex w-full items-center justify-center gap-1 text-xs text-muted-foreground hover:text-primary"
                          onClick={handleResendOtp}
                          disabled={step === "otp_verifying"}
                        >
                          <RefreshCw className="h-3 w-3" />
                          Reenviar código
                        </button>
                        <div className="border-t pt-4">
                          <DeclineBlock
                            declineReason={declineReason}
                            setDeclineReason={setDeclineReason}
                            declining={declining}
                            onDecline={handleDecline}
                          />
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}

              {step === "review" && !otpVerified && (
                <Card>
                  <CardContent className="space-y-5 pt-6">
                    <p className="text-sm leading-relaxed text-muted-foreground">{CONSENT_TEXT}</p>
                    {error && (
                      <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
                    )}
                    <div className="space-y-2">
                      <Button className="w-full" size="lg" onClick={handleRequestOtp}>
                        Firmar documento
                      </Button>
                      <p className="text-center text-xs text-muted-foreground">
                        Se enviará un código de un solo uso (SMS) al número verificado. Después podrás trazar tu firma
                        manuscrita.
                      </p>
                    </div>
                    <div className="border-t pt-4">
                      <DeclineBlock
                        declineReason={declineReason}
                        setDeclineReason={setDeclineReason}
                        declining={declining}
                        onDecline={handleDecline}
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

              {step === "review" && otpVerified && (
                <Card className="border-amber-500/20 bg-amber-950/15">
                  <CardContent className="space-y-4 pt-6">
                    <p className="text-sm text-muted-foreground">
                      Identidad verificada. Abre la ventana de firma para dibujar tu rúbrica y finalizar el acto.
                    </p>
                    <Button className="w-full" size="lg" onClick={() => setStep("awaiting_signature")}>
                      Continuar con la firma manuscrita
                    </Button>
                    <DeclineBlock
                      declineReason={declineReason}
                      setDeclineReason={setDeclineReason}
                      declining={declining}
                      onDecline={handleDecline}
                    />
                  </CardContent>
                </Card>
              )}

              {step === "awaiting_signature" && (
                <p className="text-center text-sm text-muted-foreground">
                  Completa tu firma en la ventana emergente. Si la cerraste, usa el botón inferior cuando vuelvas a
                  esta pantalla.
                </p>
              )}
            </div>
          </section>
        )}
      </main>

      <Dialog
        open={signatureModalOpen}
        onOpenChange={(open) => {
          if (!open && step === "signing") return;
          if (!open && step === "awaiting_signature") setStep("review");
        }}
      >
        <DialogContent
          className="max-w-lg gap-0 p-0 sm:max-w-lg"
          showCloseButton={step !== "signing"}
          onPointerDownOutside={(e) => step === "signing" && e.preventDefault()}
          onEscapeKeyDown={(e) => step === "signing" && e.preventDefault()}
        >
          <div className="border-b border-border/60 bg-muted/30 px-5 py-4">
            <DialogHeader className="gap-1 text-left">
              <DialogTitle className="font-serif text-lg">Firma manuscrita</DialogTitle>
              <DialogDescription>
                Dibuja tu firma en el recuadro. Esta imagen se incorporará al documento electrónico junto con la
                evidencia de la verificación por SMS.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="space-y-4 px-5 py-5">
            <div className="overflow-hidden rounded-lg border-2 border-dashed border-border bg-white">
              <SignatureCanvas
                key={otpId ?? "signature"}
                ref={sigCanvasRef}
                penColor="#0f172a"
                canvasProps={{
                  className: "w-full touch-none",
                  style: { width: "100%", height: 200 },
                }}
                onEnd={() => setHasSig(true)}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">Dibuja dentro del recuadro; puedes borrar y repetir.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={clearSignature}
                disabled={step === "signing"}
              >
                <Eraser className="h-3.5 w-3.5" />
                Borrar
              </Button>
            </div>
            {error && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
            )}
          </div>
          <DialogFooter className="border-t border-border/60 bg-muted/20 px-5 py-4 sm:justify-between">
            <p className="hidden text-xs text-muted-foreground sm:block">Paso final: confirma solo cuando la firma sea legible.</p>
            <Button
              type="button"
              size="lg"
              className="w-full sm:w-auto min-w-[12rem]"
              onClick={() => void executeSign()}
              disabled={!hasSig || step === "signing"}
            >
              {step === "signing" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando firma…
                </>
              ) : (
                <>
                  <PenLine className="mr-2 h-4 w-4" />
                  Finalizar firma
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DeclineBlock({
  declineReason,
  setDeclineReason,
  declining,
  onDecline,
}: {
  declineReason: string;
  setDeclineReason: (v: string) => void;
  declining: boolean;
  onDecline: () => void | Promise<void>;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground hover:text-destructive">
          No deseo firmar este documento
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Rechazar la firma?</AlertDialogTitle>
          <AlertDialogDescription>
            Si rechazas, el documento volverá a estado borrador y el equipo será notificado. Esta acción no se puede
            deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div>
          <Textarea
            placeholder="Motivo del rechazo (opcional)"
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            rows={3}
            className="text-sm"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onDecline}
            disabled={declining}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {declining ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Rechazando…
              </>
            ) : (
              "Confirmar rechazo"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
