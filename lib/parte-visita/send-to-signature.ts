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
import { normalizeComercialWhatsappPhone } from "@/lib/routing/comercial-whatsapp";
import { promoteDraftDemand } from "@/lib/provisionals/promotion";
import { extractDireccionFromRaw } from "@/lib/nota-encargo/utils";

export async function handleParteVisitaFlowResponse(
  session: ParteVisitaSession,
  formData: Record<string, unknown>,
): Promise<void> {
  const nombreCompleto = String(formData.nombre_completo ?? "").trim();
  const dni = String(formData.dni ?? "").trim().toUpperCase();
  const telefono = String(formData.telefono ?? "").trim();
  const aceptaLopd =
    formData.acepta_lopd === true || formData.acepta_lopd === "true";
  const buyerPhone = telefono || session.buyerPhone;

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

  if (session.draftDemandId) {
    try {
      await promoteDraftDemand({
        draftDemandId: session.draftDemandId,
        comercialId: session.comercialId,
        buyerName: nombreCompleto || null,
        buyerPhone,
        buyerDni: dni || null,
        correlationId: session.id,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`[parte-visita] Error promoviendo demanda provisional ${session.draftDemandId}: ${reason}`);
    }
  }

  const comercial = await resolveComercial({
    comercialId: session.comercialId,
    requireActive: false,
  });
  const agenteName = comercial?.nombre ?? "URUS Capital Group";
  const signerPhone = normalizeComercialWhatsappPhone(comercial);
  if (!signerPhone) {
    throw new Error(
      `No se pudo resolver teléfono WhatsApp del comercial ${session.comercialId} para iniciar firma`,
    );
  }

  // Recalcular dirección desde el último snapshot de la propiedad. El campo
  // `session.direccion` se persistió al PROGRAMAR la visita y puede ser
  // genérico ("Andalucia, Córdoba") si la propiedad aún no tenía calle/numero
  // sincronizado en ese momento. Si ahora ya hay datos en el snapshot, los
  // usamos; si no, mantenemos lo cacheado.
  let direccionPdf = session.direccion;
  try {
    const property = await prisma.propertyCurrent.findUnique({
      where: { codigo: session.propertyCode },
      select: { ciudad: true, zona: true },
    });
    if (property) {
      const snapshot = await prisma.propertySnapshot.findFirst({
        where: { codigo: session.propertyCode },
        orderBy: { lastSeenAt: "desc" },
        select: { raw: true },
      });
      if (snapshot?.raw && typeof snapshot.raw === "object") {
        const raw = snapshot.raw as Record<string, unknown>;
        const direccionDesdeRaw = extractDireccionFromRaw(raw, {
          ciudad: property.ciudad,
          zona: property.zona,
        });
        if (direccionDesdeRaw && direccionDesdeRaw.trim().length > 0) {
          direccionPdf = direccionDesdeRaw;
        }
      }
    }
  } catch (err) {
    console.warn(
      `[parte-visita] No se pudo recalcular la dirección desde snapshot para ${session.propertyCode}:`,
      err instanceof Error ? err.message : err,
    );
  }

  // 2. Generate PDF — fechas/horas en zona horaria del negocio (Europe/Madrid),
  // no la del servidor (Vercel = UTC).
  const horaPdf = session.visitDateTime.toLocaleTimeString("es-ES", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
  });
  const pdfBuffer = await generateParteVisitaPdf({
    nombre: nombreCompleto,
    dni,
    telefono,
    direccion: direccionPdf,
    tipoOperacion: session.tipoOperacion as "VENTA" | "ALQUILER",
    precio: session.precio,
    aceptaLopd,
    fecha: session.visitDateTime,
    hora: horaPdf,
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
      signerPhone,
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
      phone: buyerPhone,
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
      signerPhone,
      signingChannel: "COMERCIAL_DEVICE",
      beneficiaryPhone: buyerPhone,
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
