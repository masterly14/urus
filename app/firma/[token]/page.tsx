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

type FirmaStep = "draw" | "otp_sending" | "otp_input" | "otp_verifying" | "signing" | "done" | "declined";

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
  const executeSignRef = useRef<(() => Promise<void>) | null>(null);
  const [meta, setMeta] = useState<FirmaMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SignResult | null>(null);
  const [hasSig, setHasSig] = useState(false);

  const [step, setStep] = useState<FirmaStep>("draw");
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
    if (!sigCanvasRef.current || sigCanvasRef.current.isEmpty()) {
      setError("Dibuja tu firma antes de continuar.");
      return;
    }
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
        setStep("draw");
        return;
      }
      setOtpId(data.otpId);
      setOtpPhone(data.phoneMasked);
      setOtpCode("");
      setStep("otp_input");
    } catch {
      setError("Error de conexión al enviar el código");
      setStep("draw");
    }
  }, [token, isUiMock]);

  const handleVerifyOtp = useCallback(async () => {
    if (!otpId || otpCode.length !== 6) return;

    setStep("otp_verifying");
    setOtpError(null);

    if (isUiMock === true) {
      await new Promise((r) => setTimeout(r, 400));
      setStep("signing");
      await executeSignRef.current?.();
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

      setStep("signing");
      await executeSignRef.current?.();
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
    setError(null);
    try {
      const signatureImageBase64 = sigCanvasRef.current!
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
        setStep("draw");
        return;
      }
      setResult(data);
      setStep("done");
    } catch {
      setError("Error de conexión al firmar");
      setStep("draw");
    }
  }, [token, otpId, isUiMock]);

  useEffect(() => {
    executeSignRef.current = executeSign;
  }, [executeSign]);

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold tracking-tight">Firma electrónica</span>
          </div>
          <span className="text-xs text-muted-foreground">
            Operación {meta.operationId}
          </span>
        </div>
        {isUiMock === true && (
          <div className="border-b border-amber-500/40 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-100">
            <p className="mx-auto max-w-5xl px-4 py-2 text-center text-xs font-medium">
              Vista previa (mock): datos y PDF de demostración. Añade{" "}
              <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-900/60">?mock=1</code> o{" "}
              <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-900/60">?uiMock=1</code> a la URL.
            </p>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <section className="order-2 lg:order-1">
          <Card className="overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                {kindLabel}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <iframe
                src={meta.pdfUrl}
                className="w-full border-0"
                style={{ height: "75vh" }}
                title="Documento a firmar"
              />
            </CardContent>
          </Card>
        </section>

        <aside className="order-1 lg:order-2 flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Datos de la firma</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">Firmante:</span>{" "}
                <span className="font-medium">{meta.signerName}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Email:</span>{" "}
                <span className="font-medium">{meta.signerEmail}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Documento:</span>{" "}
                <span className="font-medium">{kindLabel}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Enviado:</span>{" "}
                <span className="font-medium">
                  {new Date(meta.sentAt).toLocaleDateString("es-ES")}
                </span>
              </div>
            </CardContent>
          </Card>

          {isTerminalOrDone ? (
            isDeclined ? (
              <Card className="border-red-500/30 bg-red-50/50 dark:bg-red-950/20">
                <CardContent className="pt-6 text-center space-y-3">
                  <XCircle className="mx-auto h-10 w-10 text-red-600" />
                  <p className="text-lg font-semibold text-red-700 dark:text-red-400">
                    Firma rechazada
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Has indicado que no deseas firmar este documento.
                    El equipo de Urus Capital ha sido notificado.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-green-500/30 bg-green-50/50 dark:bg-green-950/20">
                <CardContent className="pt-6 text-center space-y-3">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
                  <p className="text-lg font-semibold text-green-700 dark:text-green-400">
                    Documento firmado
                  </p>
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
                      className="inline-block text-sm text-primary underline"
                    >
                      Descargar documento firmado
                    </a>
                  )}
                </CardContent>
              </Card>
            )
          ) : (
            <>
              {/* --- Firma manuscrita --- */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <PenLine className="h-4 w-4" />
                    Firma manuscrita
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-lg border-2 border-dashed border-muted-foreground/30 bg-white overflow-hidden">
                    <SignatureCanvas
                      ref={sigCanvasRef}
                      penColor="#1a1a2e"
                      canvasProps={{
                        className: "w-full",
                        style: { width: "100%", height: 160 },
                      }}
                      onEnd={() => setHasSig(true)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-muted-foreground">
                      Dibuja tu firma dentro del recuadro
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={clearSignature}
                      disabled={step !== "draw"}
                    >
                      <Eraser className="h-3 w-3" />
                      Borrar
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* --- OTP / Verificación --- */}
              {(step === "otp_input" || step === "otp_verifying" || step === "otp_sending") && (
                <Card className="border-primary/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <KeyRound className="h-4 w-4" />
                      Verificación por SMS
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {step === "otp_sending" ? (
                      <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Enviando código...
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
                          placeholder="000000"
                          className="text-center text-2xl tracking-[0.5em] font-mono"
                          value={otpCode}
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                            setOtpCode(v);
                            setOtpError(null);
                          }}
                          disabled={step === "otp_verifying"}
                          autoFocus
                        />

                        {otpError && (
                          <p className="text-sm text-destructive">{otpError}</p>
                        )}

                        <Button
                          className="w-full"
                          onClick={handleVerifyOtp}
                          disabled={otpCode.length !== 6 || step === "otp_verifying"}
                        >
                          {step === "otp_verifying" ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Verificando...
                            </>
                          ) : (
                            "Verificar código"
                          )}
                        </Button>

                        <button
                          type="button"
                          className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-primary mx-auto"
                          onClick={handleResendOtp}
                          disabled={step === "otp_verifying"}
                        >
                          <RefreshCw className="h-3 w-3" />
                          Reenviar código
                        </button>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* --- Consentimiento + Botón --- */}
              {(step === "draw" || step === "signing") && (
                <Card>
                  <CardContent className="pt-6 space-y-4">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {CONSENT_TEXT}
                    </p>

                    {error && (
                      <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                      </div>
                    )}

                    <Button
                      className="w-full"
                      size="lg"
                      onClick={handleRequestOtp}
                      disabled={step === "signing" || !hasSig}
                    >
                      {step === "signing" ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Firmando...
                        </>
                      ) : (
                        "Firmar documento"
                      )}
                    </Button>

                    {!hasSig && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 text-center">
                        Dibuja tu firma arriba para habilitar el botón.
                      </p>
                    )}

                    <p className="text-[10px] text-muted-foreground text-center leading-tight">
                      Se enviará un código de verificación a tu teléfono.
                    </p>

                    <div className="pt-2 border-t">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full text-xs text-muted-foreground hover:text-destructive"
                            disabled={step === "signing"}
                          >
                            No deseo firmar este documento
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              ¿Rechazar la firma?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Si rechazas, el documento volverá a estado borrador
                              y el equipo será notificado. Esta acción no se puede deshacer.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <div className="px-0">
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
                              onClick={handleDecline}
                              disabled={declining}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {declining ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Rechazando...
                                </>
                              ) : (
                                "Confirmar rechazo"
                              )}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </aside>
      </main>
    </div>
  );
}
