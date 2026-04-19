/**
 * Handles the complete flow after the buyer submits the WhatsApp Flow form:
 * 1. Persist form data to ParteVisitaSession
 * 2. Generate PDF
 * 3. Upload to Cloudinary
 * 4. Create SignatureRequest + LegalDocument
 * 5. Emit FIRMA_ENVIADA -> existing handler sends signing link via WhatsApp
 */

import type { ParteVisitaSession } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";
import { enqueueJob } from "@/lib/job-queue";
import { uploadContractDocument } from "@/lib/cloudinary/upload-document";
import { computeSha256, buildSigningUrl } from "@/lib/firma/engine";
import { generateSigningToken } from "@/lib/firma/token";
import { generateParteVisitaPdf } from "./generate-pdf";
import { resolveComercial } from "@/lib/routing/resolve-comercial";

export async function handleParteVisitaFlowResponse(
  session: ParteVisitaSession,
  formData: Record<string, unknown>,
): Promise<void> {
  const nombreCompleto = String(formData.nombre_completo ?? "");
  const dni = String(formData.dni ?? "");
  const telefono = String(formData.telefono ?? "");
  const aceptaLopd =
    formData.acepta_lopd === true || formData.acepta_lopd === "true";

  // 1. Update session with form data
  await prisma.parteVisitaSession.update({
    where: { id: session.id },
    data: {
      state: "FORMULARIO_COMPLETADO",
      buyerNombre: nombreCompleto,
      buyerDni: dni,
      buyerTelefono: telefono,
      aceptaLopd,
    },
  });

  const comercial = await resolveComercial({
    comercialId: session.comercialId,
    requireActive: false,
  });
  const agenteName = comercial?.nombre ?? "URUS Capital Group";

  // 2. Generate PDF
  const pdfBuffer = await generateParteVisitaPdf({
    nombre: nombreCompleto,
    dni,
    telefono,
    direccion: session.direccion,
    tipoOperacion: session.tipoOperacion as "VENTA" | "ALQUILER",
    precio: session.precio,
    aceptaLopd,
    fecha: session.visitDateTime,
    hora: session.visitDateTime.toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    agente: agenteName,
  });

  // 3. Upload to Cloudinary
  const uploadResult = await uploadContractDocument({
    buffer: pdfBuffer,
    fileName: `parte_visita_${session.propertyRef}.pdf`,
    folder: `parte-visita/${session.propertyCode}`,
    tags: ["parte_visita", session.propertyRef],
    context: {
      propertyCode: session.propertyCode,
      sessionId: session.id,
    },
  });

  // 4. Create SignatureRequest
  const documentHash = computeSha256(pdfBuffer);
  const signingToken = generateSigningToken();
  const signingUrl = buildSigningUrl(signingToken);
  const slaDeadline = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);

  const signatureRequest = await prisma.signatureRequest.create({
    data: {
      operationId: session.propertyCode,
      propertyCode: session.propertyCode,
      documentKind: "PARTE_VISITA",
      cloudinaryUrl: uploadResult.secureUrl,
      signingUrl,
      status: "SENT",
      signerName: nombreCompleto,
      signerEmail: "",
      signerPhone: session.buyerPhone,
      sentAt: new Date(),
      slaDeadlineDays: 5,
      slaDeadline,
      documentHash,
      signingToken,
    },
  });

  // 5. Create LegalDocument + Party
  const legalDocument = await prisma.legalDocument.create({
    data: {
      operationId: `PV-${session.id}`,
      propertyCode: session.propertyCode,
      documentKind: "PARTE_VISITA",
      status: "SENT_TO_SIGNATURE",
      cloudinaryUrl: uploadResult.secureUrl,
      signatureRequestId: signatureRequest.id,
    },
  });

  await prisma.legalDocumentParty.create({
    data: {
      legalDocumentId: legalDocument.id,
      role: "COMPRADOR",
      fullName: nombreCompleto,
      nifNie: dni,
      phone: session.buyerPhone,
    },
  });

  // 6. Update session with references
  await prisma.parteVisitaSession.update({
    where: { id: session.id },
    data: {
      state: "FIRMA_ENVIADA",
      documentUrl: uploadResult.secureUrl,
      legalDocumentId: legalDocument.id,
      signatureRequestId: signatureRequest.id,
    },
  });

  // 7. Emit event -> existing FIRMA_ENVIADA handler sends WhatsApp with signing link
  const firmaEvent = await appendEvent({
    type: "FIRMA_ENVIADA",
    aggregateType: "PROPERTY",
    aggregateId: session.propertyCode,
    payload: {
      signatureRequestId: signatureRequest.id,
      operationId: `PV-${session.id}`,
      documentKind: "PARTE_VISITA",
      signingUrl,
      signerPhone: session.buyerPhone,
    },
  });

  await enqueueJob({
    type: "PROCESS_EVENT",
    payload: { eventId: firmaEvent.id, eventType: firmaEvent.type },
    sourceEventId: firmaEvent.id,
    idempotencyKey: `process-event:${firmaEvent.id}`,
  });

  console.log(
    `[parte-visita] Signature flow initiated for session ${session.id} — signingUrl: ${signingUrl}`,
  );
}
