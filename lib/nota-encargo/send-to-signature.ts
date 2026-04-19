/**
 * Handles the complete flow after the owner submits the WhatsApp Flow form:
 * 1. Persist form data to NotaEncargoSession
 * 2. Generate PDF
 * 3. Upload to Cloudinary
 * 4. Create SignatureRequest + LegalDocument
 * 5. Emit FIRMA_ENVIADA → existing handler sends signing link via WhatsApp
 */

import type { NotaEncargoSession } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";
import { enqueueJob } from "@/lib/job-queue";
import { uploadContractDocument } from "@/lib/cloudinary/upload-document";
import { computeSha256, buildSigningUrl } from "@/lib/firma/engine";
import { generateSigningToken } from "@/lib/firma/token";
import { generateNotaEncargoPdf } from "./generate-pdf";
import { resolveComercial } from "@/lib/routing/resolve-comercial";

export async function handleNotaEncargoFlowResponse(
  session: NotaEncargoSession,
  formData: Record<string, unknown>,
): Promise<void> {
  const nombreCompleto = String(formData.nombre_completo ?? "");
  const dni = String(formData.dni ?? "");
  const telefono = String(formData.telefono ?? "");
  const domicilioFiscal = String(formData.domicilio_fiscal ?? "");
  const duracionMeses = parseInt(String(formData.duracion_meses ?? "0"), 10);
  const tipoNota = String(formData.tipo_nota ?? "N1");
  const aceptaLopd =
    formData.acepta_lopd === true || formData.acepta_lopd === "true";

  // 1. Update session with form data
  await prisma.notaEncargoSession.update({
    where: { id: session.id },
    data: {
      state: "FORMULARIO_COMPLETADO",
      propietarioNombre: nombreCompleto,
      propietarioDni: dni,
      propietarioTelefono: telefono,
      domicilioFiscal,
      duracionMeses,
      tipoNotaEncargo: tipoNota,
      aceptaLopd,
    },
  });

  // Resolve comercial name for the PDF
  const comercial = await resolveComercial({
    comercialId: session.comercialId,
    requireActive: false,
  });
  const agenteName = comercial?.nombre ?? "URUS Capital Group";

  // 2. Generate PDF
  const pdfBuffer = await generateNotaEncargoPdf({
    nombre: nombreCompleto,
    dni,
    telefono,
    domicilioFiscal,
    direccion: session.direccion,
    tipoOperacion: session.tipoOperacion as "VENTA" | "ALQUILER",
    precio: session.precio,
    duracionMeses,
    tipoNota: tipoNota as "N1" | "N2" | "N3",
    aceptaLopd,
    fecha: new Date(),
    hora: new Date().toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    agente: agenteName,
  });

  // 3. Upload to Cloudinary
  const uploadResult = await uploadContractDocument({
    buffer: pdfBuffer,
    fileName: `nota_encargo_${session.propertyRef}.pdf`,
    folder: `nota-encargo/${session.propertyCode}`,
    tags: ["nota_encargo", session.propertyRef],
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
      documentKind: "NOTA_ENCARGO",
      cloudinaryUrl: uploadResult.secureUrl,
      signingUrl,
      status: "SENT",
      signerName: nombreCompleto,
      signerEmail: "",
      signerPhone: session.propietarioPhone,
      sentAt: new Date(),
      slaDeadlineDays: 5,
      slaDeadline,
      documentHash,
      signingToken,
    },
  });

  // 5. Create or update LegalDocument + Party (idempotent for retries)
  const legalDocument = await prisma.legalDocument.upsert({
    where: {
      operationId_documentKind: {
        operationId: session.propertyCode,
        documentKind: "NOTA_ENCARGO",
      },
    },
    create: {
      operationId: session.propertyCode,
      propertyCode: session.propertyCode,
      documentKind: "NOTA_ENCARGO",
      status: "SENT_TO_SIGNATURE",
      cloudinaryUrl: uploadResult.secureUrl,
      signatureRequestId: signatureRequest.id,
    },
    update: {
      status: "SENT_TO_SIGNATURE",
      cloudinaryUrl: uploadResult.secureUrl,
      signatureRequestId: signatureRequest.id,
    },
  });

  const existingParty = await prisma.legalDocumentParty.findFirst({
    where: { legalDocumentId: legalDocument.id, phone: session.propietarioPhone },
  });

  if (existingParty) {
    await prisma.legalDocumentParty.update({
      where: { id: existingParty.id },
      data: { fullName: nombreCompleto, nifNie: dni, address: domicilioFiscal },
    });
  } else {
    await prisma.legalDocumentParty.create({
      data: {
        legalDocumentId: legalDocument.id,
        role: "PROPIETARIO",
        fullName: nombreCompleto,
        nifNie: dni,
        phone: session.propietarioPhone,
        address: domicilioFiscal,
      },
    });
  }

  // 6. Update session with references
  await prisma.notaEncargoSession.update({
    where: { id: session.id },
    data: {
      state: "FIRMA_ENVIADA",
      documentUrl: uploadResult.secureUrl,
      legalDocumentId: legalDocument.id,
      signatureRequestId: signatureRequest.id,
    },
  });

  // 7. Emit event + enqueue PROCESS_EVENT → existing FIRMA_ENVIADA handler sends WhatsApp with signing link
  const firmaEvent = await appendEvent({
    type: "FIRMA_ENVIADA",
    aggregateType: "PROPERTY",
    aggregateId: session.propertyCode,
    payload: {
      signatureRequestId: signatureRequest.id,
      operationId: session.propertyCode,
      documentKind: "NOTA_ENCARGO",
      signingUrl,
      signerPhone: session.propietarioPhone,
    },
  });

  await enqueueJob({
    type: "PROCESS_EVENT",
    payload: { eventId: firmaEvent.id, eventType: firmaEvent.type },
    sourceEventId: firmaEvent.id,
    idempotencyKey: `process-event:${firmaEvent.id}`,
  });

  console.log(
    `[nota-encargo] Signature flow initiated for session ${session.id} — signingUrl: ${signingUrl}`,
  );
}
