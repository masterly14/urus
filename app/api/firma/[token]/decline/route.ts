import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store/event-store";
import { verifySigningToken } from "@/lib/firma/token";
import { isSignatureTerminalStatus } from "@/lib/signaturit/status";
import { extractSignerIp, extractUserAgent } from "@/lib/firma/engine";

export const runtime = "nodejs";

/**
 * POST /api/firma/{token}/decline
 * Permite al firmante rechazar la firma del documento.
 * Actualiza SignatureRequest → DECLINED, LegalDocument → DRAFT,
 * y emite FIRMA_RECHAZADA para que el consumer notifique al comercial.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!verifySigningToken(token)) {
    return NextResponse.json({ error: "Token inválido" }, { status: 400 });
  }

  let body: { reason?: string } = {};
  try {
    body = (await request.json()) as { reason?: string };
  } catch {
    // body vacío es válido — reason es opcional
  }

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  const sigReq = await prisma.signatureRequest.findUnique({
    where: { signingToken: token },
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

  const now = new Date();
  const signerIp = extractSignerIp(request);
  const signerUserAgent = extractUserAgent(request);

  await prisma.signatureRequest.update({
    where: { id: sigReq.id },
    data: {
      status: "DECLINED",
      completedAt: now,
      signerIp,
      signerUserAgent,
    },
  });

  const legalDoc = await prisma.legalDocument.findUnique({
    where: { signatureRequestId: sigReq.id },
    select: { id: true, status: true },
  });

  if (legalDoc && legalDoc.status !== "SIGNED") {
    await prisma.legalDocument.update({
      where: { id: legalDoc.id },
      data: { status: "DRAFT" },
    });
  }

  await appendEvent({
    type: "FIRMA_RECHAZADA",
    aggregateType: "PROPERTY",
    aggregateId: sigReq.propertyCode,
    payload: {
      signatureRequestId: sigReq.id,
      operationId: sigReq.operationId,
      documentKind: sigReq.documentKind,
      signerName: sigReq.signerName,
      reason: reason || null,
      signerIp,
      declinedAt: now.toISOString(),
    },
  });

  console.log(
    `[firma/decline] Firma rechazada: sigReq=${sigReq.id} operationId=${sigReq.operationId} signer=${sigReq.signerName} reason=${reason || "(sin motivo)"}`,
  );

  return NextResponse.json({
    status: "DECLINED",
    message: "Firma rechazada correctamente",
  });
}
