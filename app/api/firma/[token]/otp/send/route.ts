import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySigningToken } from "@/lib/firma/token";
import { isSignatureTerminalStatus } from "@/lib/signaturit/status";
import { createOtp } from "@/lib/firma/otp";

export const runtime = "nodejs";

/**
 * POST /api/firma/{token}/otp/send
 * Genera un OTP de 6 dígitos, lo persiste hasheado y lo envía por SMS via Vonage.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

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
    return NextResponse.json(
      { error: "No hay número de teléfono asociado al firmante para enviar el OTP." },
      { status: 422 },
    );
  }

  try {
    const result = await createOtp(sigReq.id, phone);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[firma/otp/send] Error: ${message}`);
    return NextResponse.json(
      { error: "Error al enviar el código de verificación" },
      { status: 502 },
    );
  }
}
