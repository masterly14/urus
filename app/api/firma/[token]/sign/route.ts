import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store/event-store";
import { uploadContractDocument } from "@/lib/cloudinary";
import { verifySigningToken } from "@/lib/firma/token";
import {
  computeSha256,
  verifyDocumentIntegrity,
  extractSignerIp,
  extractUserAgent,
  DEFAULT_CONSENT_TEXT,
} from "@/lib/firma/engine";
import { stampSignaturePage } from "@/lib/firma/pdf-stamp";
import { generateAuditTrailPdf } from "@/lib/firma/audit-trail";
import { isSignatureTerminalStatus } from "@/lib/signaturit/status";
import { isOtpVerified } from "@/lib/firma/otp";
import { withObservedRoute } from "@/lib/observability";


export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/firma/{token}/sign
 * Procesa la firma del documento: verifica OTP, integridad, genera PDF sellado
 * con la firma manuscrita, audit trail, actualiza BD y emite FIRMA_COMPLETADA.
 */
const postHandler = async (request: Request, { params }: { params: Promise<{ token: string }> }) => {
  const { token } = await params;

  if (!verifySigningToken(token)) {
    return NextResponse.json({ error: "Token inválido" }, { status: 400 });
  }

  let body: { signatureImageBase64?: string; otpId?: string } = {};
  try {
    body = (await request.json()) as { signatureImageBase64?: string; otpId?: string };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { signatureImageBase64, otpId } = body;

  if (!signatureImageBase64 || signatureImageBase64.length < 100) {
    return NextResponse.json(
      { error: "Se requiere la imagen de la firma manuscrita (signatureImageBase64)" },
      { status: 400 },
    );
  }

  if (!otpId) {
    return NextResponse.json(
      { error: "Se requiere verificación OTP antes de firmar (otpId)" },
      { status: 400 },
    );
  }

  const sigReq = await prisma.signatureRequest.findUnique({
    where: { signingToken: token },
  });

  if (!sigReq) {
    return NextResponse.json({ error: "Firma no encontrada" }, { status: 404 });
  }

  const otpValid = await isOtpVerified(otpId, sigReq.id);
  if (!otpValid) {
    return NextResponse.json(
      { error: "OTP no verificado o no corresponde a esta firma" },
      { status: 403 },
    );
  }

  if (isSignatureTerminalStatus(sigReq.status)) {
    return NextResponse.json(
      { error: `Firma ya en estado terminal: ${sigReq.status}` },
      { status: 409 },
    );
  }

  if (!sigReq.documentHash) {
    return NextResponse.json(
      { error: "Firma sin hash de documento — flujo inconsistente" },
      { status: 500 },
    );
  }

  const pdfRes = await fetch(sigReq.cloudinaryUrl);
  if (!pdfRes.ok) {
    return NextResponse.json(
      { error: `No se pudo descargar el documento (${pdfRes.status})` },
      { status: 502 },
    );
  }
  const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());

  if (!verifyDocumentIntegrity(pdfBuffer, sigReq.documentHash)) {
    return NextResponse.json(
      { error: "Integridad del documento comprometida: el hash no coincide" },
      { status: 409 },
    );
  }

  const now = new Date();
  const signerIp = extractSignerIp(request);
  const signerUserAgent = extractUserAgent(request);
  const consentText = DEFAULT_CONSENT_TEXT;

  const signatureImageBuffer = Buffer.from(signatureImageBase64, "base64");

  const stampedPdf = await stampSignaturePage(pdfBuffer, {
    signerName: sigReq.signerName,
    documentKind: sigReq.documentKind,
    operationId: sigReq.operationId,
    signedAt: now,
    signerIp,
    documentHash: sigReq.documentHash,
    consentText,
    signatureImage: signatureImageBuffer,
  });

  const signedDocumentHash = computeSha256(stampedPdf);

  const auditTrailPdf = await generateAuditTrailPdf({
    operationId: sigReq.operationId,
    documentKind: sigReq.documentKind,
    signerName: sigReq.signerName,
    signerEmail: sigReq.signerEmail,
    signerIp,
    signerUserAgent,
    consentText,
    documentHash: sigReq.documentHash,
    signedDocumentHash,
    sentAt: sigReq.sentAt,
    openedAt: sigReq.openedAt,
    signedAt: now,
    signatureImage: signatureImageBuffer,
  });

  const [signedUpload, auditUpload] = await Promise.all([
    uploadContractDocument({
      buffer: stampedPdf,
      fileName: `${sigReq.operationId}_signed.pdf`,
      folder: `contracts/${sigReq.operationId}/signed`,
      tags: ["signed", "final", sigReq.documentKind],
      context: {
        operationId: sigReq.operationId,
        propertyCode: sigReq.propertyCode,
        documentKind: sigReq.documentKind,
      },
    }),
    uploadContractDocument({
      buffer: auditTrailPdf,
      fileName: `${sigReq.operationId}_audit_trail.pdf`,
      folder: `contracts/${sigReq.operationId}/audit`,
      tags: ["audit-trail", sigReq.documentKind],
      context: {
        operationId: sigReq.operationId,
        propertyCode: sigReq.propertyCode,
        documentKind: sigReq.documentKind,
      },
    }),
  ]);

  await prisma.signatureRequest.update({
    where: { id: sigReq.id },
    data: {
      status: "COMPLETED",
      signedAt: now,
      completedAt: now,
      signedDocumentUrl: signedUpload.secureUrl,
      auditTrailUrl: auditUpload.secureUrl,
      signerIp,
      signerUserAgent,
      consentText,
      signedDocumentHash,
    },
  });

  const legalDoc = await prisma.legalDocument.findUnique({
    where: { signatureRequestId: sigReq.id },
  });

  if (legalDoc) {
    await prisma.legalDocument.update({
      where: { id: legalDoc.id },
      data: {
        status: "SIGNED",
        signedDocumentUrl: signedUpload.secureUrl,
        auditTrailUrl: auditUpload.secureUrl,
        completedAt: now,
      },
    });

    await prisma.legalDocumentParty.updateMany({
      where: { legalDocumentId: legalDoc.id, hasSigned: false },
      data: { hasSigned: true, signedAt: now },
    });
  }

  await appendEvent({
    type: "FIRMA_COMPLETADA",
    aggregateType: "PROPERTY",
    aggregateId: sigReq.propertyCode,
    payload: {
      signatureRequestId: sigReq.id,
      operationId: sigReq.operationId,
      documentKind: sigReq.documentKind,
      signerName: sigReq.signerName,
      signerIp,
      documentHash: sigReq.documentHash,
      signedDocumentHash,
      signedDocumentUrl: signedUpload.secureUrl,
      auditTrailUrl: auditUpload.secureUrl,
    },
  });

  console.log(
    `[firma/sign] Firma completada: sigReq=${sigReq.id} operationId=${sigReq.operationId} signer=${sigReq.signerName}`,
  );

  return NextResponse.json({
    status: "COMPLETED",
    signedDocumentUrl: signedUpload.secureUrl,
    auditTrailUrl: auditUpload.secureUrl,
  });
}

export const POST = withObservedRoute({ method: "POST", route: "/api/firma/[token]/sign" }, postHandler);
