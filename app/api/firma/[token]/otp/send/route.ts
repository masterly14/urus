import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySigningToken } from "@/lib/firma/token";
import { maskPhone } from "@/lib/firma/mask-phone";
import { isSignatureTerminalStatus } from "@/lib/signaturit/status";
import { createOtp } from "@/lib/firma/otp";
import { getObservabilityContext } from "@/lib/observability/context";
import { createLogger } from "@/lib/observability/logger";
import { withObservedRoute } from "@/lib/observability";


export const runtime = "nodejs";

/**
 * POST /api/firma/{token}/otp/send
 * Genera un OTP de 6 dígitos, lo persiste hasheado y lo envía por SMS via Vonage.
 */
function routeOtpLogger() {
  const ctx = getObservabilityContext();
  if (ctx) {
    return createLogger(ctx).child({ operation: `${ctx.operation} › otp/send` });
  }
  return createLogger({
    scope: "api",
    source: "api",
    operation: "POST /api/firma/[token]/otp/send",
  });
}

const postHandler = async (_request: Request, { params }: { params: Promise<{ token: string }> }) => {
  const { token } = await params;
  const log = routeOtpLogger();

  if (!verifySigningToken(token)) {
    return NextResponse.json({ error: "Token inválido" }, { status: 400 });
  }

  const sigReq = await prisma.signatureRequest.findUnique({
    where: { signingToken: token },
    include: {
      legalDocument: {
        select: {
          parties: { select: { phone: true }, where: { phone: { not: null } } },
        },
      },
    },
  });

  if (!sigReq) {
    return NextResponse.json({ error: "Firma no encontrada" }, { status: 404 });
  }

  if (isSignatureTerminalStatus(sigReq.status)) {
    return NextResponse.json(
      { error: `Firma ya en estado terminal: ${sigReq.status}` },
      { status: 409 },
    );
  }

  const phone =
    sigReq.signerPhone ??
    sigReq.legalDocument?.parties?.[0]?.phone ??
    null;

  if (!phone) {
    log.warn("OTP no enviado: sin teléfono en solicitud ni en partes del documento", {
      signatureRequestId: sigReq.id,
      signingTokenTail: token.length > 12 ? token.slice(-12) : "[corto]",
    });
    return NextResponse.json(
      { error: "No hay número de teléfono asociado al firmante para enviar el OTP." },
      { status: 422 },
    );
  }

  const phoneSource = sigReq.signerPhone ? "signerPhone" : "legalDocument.parties[0]";

  log.info("Solicitud de envío OTP", {
    signatureRequestId: sigReq.id,
    phoneMasked: maskPhone(phone),
    phoneSource,
    signingTokenTail: token.length > 12 ? token.slice(-12) : "[corto]",
    signatureStatus: sigReq.status,
  });

  try {
    const result = await createOtp(sigReq.id, phone);
    log.info("Envío OTP completado", {
      signatureRequestId: sigReq.id,
      otpId: result.otpId,
      phoneMasked: result.phoneMasked,
    });
    return NextResponse.json(result);
  } catch (err) {
    log.error(
      "Envío OTP fallido; respuesta HTTP 502 al cliente (causa suele ser Vonage u otro proveedor SMS)",
      err,
      {
        signatureRequestId: sigReq.id,
        phoneMasked: maskPhone(phone),
        phoneSource,
        signingTokenTail: token.length > 12 ? token.slice(-12) : "[corto]",
      },
    );
    return NextResponse.json(
      { error: "Error al enviar el código de verificación" },
      { status: 502 },
    );
  }
}

export const POST = withObservedRoute({ method: "POST", route: "/api/firma/[token]/otp/send" }, postHandler);
