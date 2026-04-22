"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import SignatureCanvas from "react-signature-canvas";
import {
  CheckCircle2,
  FileText,
  KeyRound,
  Loader2,
  PenLine,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  Eraser,
} from "lucide-react";
import { FirmaPdfViewer } from "@/components/legal/firma-pdf-viewer";
import { FirmaHeader, DeclineBlock, StatusCard } from "@/components/legal/firma-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  otpRequired: boolean;
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
  NOTA_ENCARGO: "Nota de Encargo Inmobiliaria",
  PARTE_VISITA: "Parte de Visita Inmobiliaria",
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
  otpRequired: true,
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
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error && !meta) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-lg border border-red-100 bg-white p-8 text-center shadow-lg">
          <ShieldAlert className="mx-auto h-12 w-12 text-urus-danger mb-4" />
          <p className="text-lg font-semibold text-slate-900">{error}</p>
          <p className="mt-2 text-sm text-slate-500">
            El enlace de firma no es válido o ha expirado.
          </p>
        </div>
      </div>
    );
  }

  if (!meta) return null;

  const kindLabel = KIND_LABEL[meta.documentKind] ?? meta.documentKind;
  const isTerminalOrDone = meta.isTerminal || step === "done" || step === "declined";
  const isDeclined = meta.status === "DECLINED" || step === "declined";

  const signatureModalOpen = step === "awaiting_signature" || step === "signing";

  return (
    <div className="flex flex-col min-h-screen md:h-screen bg-slate-50 text-slate-900 font-sans">
      <FirmaHeader
        operationId={meta.operationId}
        documentTitle={kindLabel}
        isUiMock={isUiMock ?? false}
      />

      <div className="flex flex-1 flex-col md:flex-row md:overflow-hidden">
        {/* PDF Viewer Area */}
        <main className="relative flex flex-col bg-slate-100 border-b md:border-b-0 md:border-r border-slate-200 h-[60vh] md:h-auto md:flex-1 md:overflow-hidden">
          {isUiMock ? (
            <iframe
              src={meta.pdfUrl}
              className="block w-full h-full border-0 bg-slate-100"
              title="Documento a firmar"
            />
          ) : (
            <FirmaPdfViewer pdfSrc={`/api/firma/${token}/pdf`} />
          )}
        </main>

        {/* Actions Sidebar */}
        <aside className="w-full md:w-[420px] bg-white flex flex-col shadow-[-4px_0_24px_rgba(0,0,0,0.02)] z-10 md:overflow-y-auto">
          {isTerminalOrDone ? (
            <div className="p-8 h-full flex flex-col justify-center">
              <StatusCard
                status={isDeclined ? "declined" : "done"}
                date={meta.completedAt || undefined}
                documentUrl={result?.signedDocumentUrl ?? meta.signedDocumentUrl}
              />
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                <h2 className="font-semibold flex items-center gap-2 text-slate-800 text-lg mb-4">
                  <FileText className="h-5 w-5 text-blue-600" />
                  Datos del firmante
                </h2>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Nombre completo</p>
                    <p className="font-medium text-slate-900 mt-0.5">{meta.signerName}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Correo electrónico</p>
                    <p className="font-medium text-slate-900 mt-0.5 break-all">{meta.signerEmail}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Fecha de envío</p>
                    <p className="font-medium text-slate-900 mt-0.5">{new Date(meta.sentAt).toLocaleDateString("es-ES")}</p>
                  </div>
                </div>
              </div>

              <div className="flex-1 p-6 flex flex-col justify-center">
                {(step === "otp_sending" || step === "otp_input" || step === "otp_verifying") && (
                  <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-center gap-2 text-blue-700 font-semibold mb-2">
                      <KeyRound className="h-5 w-5" />
                      <h3>Verificación por SMS</h3>
                    </div>
                    {step === "otp_sending" ? (
                      <div className="flex flex-col items-center justify-center gap-3 py-8 text-sm text-slate-500 bg-blue-50/50 rounded-lg border border-blue-100">
                        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                        Enviando código al teléfono registrado…
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
                          <Smartphone className="h-4 w-4 shrink-0 text-blue-600" />
                          <span>Enviado al <strong>{otpPhone ?? "teléfono registrado"}</strong></span>
                        </div>
                        <div className="space-y-3">
                          <Input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={6}
                            placeholder="• • • • • •"
                            className="text-center text-3xl tracking-[0.3em] sm:tracking-[0.5em] font-mono h-14 bg-white border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                            value={otpCode}
                            onChange={(e) => {
                              const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                              setOtpCode(v);
                              setOtpError(null);
                            }}
                            disabled={step === "otp_verifying"}
                            autoFocus
                          />
                          {otpError && <p className="text-sm font-medium text-urus-danger text-center">{otpError}</p>}
                        </div>
                        <Button
                          className="w-full h-12 text-base bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 transition-all"
                          onClick={handleVerifyOtp}
                          disabled={otpCode.length !== 6 || step === "otp_verifying"}
                        >
                          {step === "otp_verifying" ? (
                            <>
                              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                              Verificando…
                            </>
                          ) : (
                            "Confirmar código"
                          )}
                        </Button>
                        <button
                          type="button"
                          className="flex w-full items-center justify-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600 transition-colors py-2"
                          onClick={handleResendOtp}
                          disabled={step === "otp_verifying"}
                        >
                          <RefreshCw className="h-4 w-4" />
                          Reenviar código
                        </button>
                        <DeclineBlock
                          declineReason={declineReason}
                          setDeclineReason={setDeclineReason}
                          declining={declining}
                          onDecline={handleDecline}
                        />
                      </>
                    )}
                  </div>
                )}

                {step === "review" && !otpVerified && (
                  <div className="space-y-6 animate-in fade-in duration-500">
                    <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100 text-sm leading-relaxed text-slate-600">
                      {CONSENT_TEXT}
                    </div>
                    {error && (
                      <div className="rounded-lg bg-urus-danger-bg p-3 text-sm font-medium text-urus-danger border border-urus-danger/20">{error}</div>
                    )}
                    <div className="space-y-4">
                      <Button
                        className="w-full h-12 text-base bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 transition-all"
                        onClick={() => {
                          if (meta.otpRequired) {
                            void handleRequestOtp();
                            return;
                          }
                          setOtpVerified(true);
                          setStep("awaiting_signature");
                        }}
                      >
                        Firmar documento
                      </Button>
                      {meta.otpRequired ? (
                        <p className="text-center text-xs text-slate-500 max-w-xs mx-auto">
                          Se enviará un código de un solo uso (SMS) a tu móvil. Tras verificarlo, podrás trazar tu firma manuscrita.
                        </p>
                      ) : (
                        <p className="text-center text-xs text-urus-warning max-w-xs mx-auto">
                          Verificación OTP pausada temporalmente. Puedes continuar directamente con la firma manuscrita.
                        </p>
                      )}
                    </div>
                    <DeclineBlock
                      declineReason={declineReason}
                      setDeclineReason={setDeclineReason}
                      declining={declining}
                      onDecline={handleDecline}
                    />
                  </div>
                )}

                {step === "review" && otpVerified && (
                  <div className="space-y-6 animate-in fade-in duration-500">
                    <div className="flex flex-col items-center justify-center text-center p-6 bg-urus-success/10 rounded-lg border border-urus-success/20 space-y-3">
                      <CheckCircle2 className="h-8 w-8 text-urus-success" />
                      <p className="text-sm font-medium text-urus-success">
                        Identidad verificada
                      </p>
                      <p className="text-xs text-urus-success/80">
                        Abre la ventana de firma para dibujar tu rúbrica y finalizar el acto.
                      </p>
                    </div>
                    <Button className="w-full h-12 text-base bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20" onClick={() => setStep("awaiting_signature")}>
                      Continuar con la firma
                    </Button>
                    <DeclineBlock
                      declineReason={declineReason}
                      setDeclineReason={setDeclineReason}
                      declining={declining}
                      onDecline={handleDecline}
                    />
                  </div>
                )}

                {step === "awaiting_signature" && (
                  <div className="flex flex-col items-center justify-center text-center py-8 space-y-4">
                    <div className="p-4 rounded-full bg-slate-100">
                      <PenLine className="h-8 w-8 text-slate-400" />
                    </div>
                    <p className="text-sm text-slate-600">
                      Completa tu firma en la ventana emergente. Si la cerraste, usa el botón inferior cuando vuelvas a esta pantalla.
                    </p>
                    <Button variant="outline" className="mt-4 border-slate-300 text-slate-700" onClick={() => setStep("signing")}>
                      Reabrir ventana de firma
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      <Dialog
        open={signatureModalOpen}
        onOpenChange={(open) => {
          if (!open && step === "signing") return;
          if (!open && step === "awaiting_signature") setStep("review");
        }}
      >
        <DialogContent
          className="w-[95vw] max-w-lg gap-0 p-0 sm:max-w-lg rounded-lg overflow-hidden border-0 shadow-2xl"
          showCloseButton={step !== "signing"}
          onPointerDownOutside={(e) => step === "signing" && e.preventDefault()}
          onEscapeKeyDown={(e) => step === "signing" && e.preventDefault()}
        >
          <div className="border-b border-slate-100 bg-white px-5 py-4 sm:px-6 sm:py-5">
            <DialogHeader className="gap-1.5 text-left">
              <DialogTitle className="text-lg sm:text-xl font-semibold text-slate-900 flex items-center gap-2">
                <PenLine className="h-5 w-5 text-blue-600" />
                Firma manuscrita
              </DialogTitle>
              <DialogDescription className="text-sm text-slate-500">
                Dibuja tu firma en el recuadro inferior. Esta imagen se incorporará al documento electrónico junto con la evidencia de la verificación SMS.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="bg-slate-50 px-5 py-5 sm:px-6 sm:py-6">
            <div className="overflow-hidden rounded-lg border-2 border-dashed border-slate-300 bg-white shadow-inner transition-colors focus-within:border-blue-400">
              <SignatureCanvas
                key={otpId ?? "signature"}
                ref={sigCanvasRef}
                penColor="#0f172a"
                canvasProps={{
                  className: "w-full touch-none",
                  style: { width: "100%", height: 180 },
                }}
                onEnd={() => setHasSig(true)}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
              <p className="text-xs font-medium text-slate-400">Dibuja dentro del recuadro</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 h-8"
                onClick={clearSignature}
                disabled={step === "signing"}
              >
                <Eraser className="h-3.5 w-3.5" />
                Borrar lienzo
              </Button>
            </div>
            {error && (
              <div className="mt-4 rounded-lg bg-urus-danger-bg px-4 py-3 text-sm font-medium text-urus-danger border border-urus-danger/20">{error}</div>
            )}
          </div>
          <DialogFooter className="border-t border-slate-100 bg-white px-5 py-4 sm:px-6 sm:py-4 sm:justify-between items-center gap-3">
            <p className="hidden text-xs text-slate-400 sm:block max-w-[200px] leading-tight">
              Confirma solo cuando la firma sea perfectamente legible.
            </p>
            <Button
              type="button"
              className="w-full sm:w-auto min-w-[14rem] h-11 text-base bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 transition-all"
              onClick={() => void executeSign()}
              disabled={!hasSig || step === "signing"}
            >
              {step === "signing" ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Procesando firma…
                </>
              ) : (
                <>
                  <PenLine className="mr-2 h-5 w-5" />
                  Finalizar documento
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
