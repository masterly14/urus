import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySigningToken } from "@/lib/firma/token";
import { isSignatureTerminalStatus } from "@/lib/signaturit/status";

export const runtime = "nodejs";

/**
 * GET /api/firma/{token}
 * Devuelve metadata de la firma para la página pública.
 */
export async function GET(
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
          id: true,
          status: true,
          parties: { select: { fullName: true, role: true, email: true, phone: true } },
        },
      },
    },
  });

  if (!sigReq) {
    return NextResponse.json({ error: "Firma no encontrada" }, { status: 404 });
  }

  const isTerminal = isSignatureTerminalStatus(sigReq.status);

  const phone =
    sigReq.signerPhone ??
    sigReq.legalDocument?.parties?.find((p: { phone: string | null }) => p.phone)?.phone ??
    null;
  const hasPhone = !!phone;
  const phoneMasked = phone
    ? "*".repeat(Math.max(0, phone.length - 4)) + phone.slice(-4)
    : null;

  return NextResponse.json({
    operationId: sigReq.operationId,
    documentKind: sigReq.documentKind,
    signerName: sigReq.signerName,
    signerEmail: sigReq.signerEmail,
    status: sigReq.status,
    isTerminal,
    hasPhone,
    phoneMasked,
    pdfUrl: sigReq.cloudinaryUrl,
    signedDocumentUrl: sigReq.signedDocumentUrl,
    sentAt: sigReq.sentAt.toISOString(),
    completedAt: sigReq.completedAt?.toISOString() ?? null,
    parties: sigReq.legalDocument?.parties ?? [],
  });
}
