/**
 * Regenera el PDF del Parte de Visita para una sesión existente y lo sustituye
 * en Cloudinary, manteniendo el mismo `public_id` (mismo URL → el firmante
 * sigue accediendo desde el mismo enlace de firma).
 *
 * También actualiza `cloudinaryUrl` y `documentHash` en `SignatureRequest` y
 * `LegalDocument` (si existen) para mantener trazabilidad y validación.
 *
 * NO reenvía nada al firmante; el enlace ya entregado sigue siendo válido.
 *
 * Uso: npx tsx scripts/regenerate-parte-visita-pdf.ts <sessionId>
 */

import { prisma } from "@/lib/prisma";
import { generateParteVisitaPdf } from "@/lib/parte-visita/generate-pdf";
import { uploadContractDocument } from "@/lib/cloudinary/upload-document";
import { extractDireccionFromRaw } from "@/lib/nota-encargo/utils";
import { resolveComercial } from "@/lib/routing/resolve-comercial";
import { computeSha256 } from "@/lib/firma/engine";

async function main() {
  const sessionId = process.argv[2];
  if (!sessionId) {
    console.error(
      "Uso: npx tsx scripts/regenerate-parte-visita-pdf.ts <sessionId>",
    );
    process.exit(2);
  }

  const session = await prisma.parteVisitaSession.findUnique({
    where: { id: sessionId },
  });
  if (!session) {
    console.error(`Sesión ${sessionId} no encontrada`);
    process.exit(1);
  }

  if (!session.buyerNombre || !session.buyerDni) {
    console.error(
      `Sesión ${sessionId} sin datos de comprador (nombre/dni). state=${session.state}`,
    );
    process.exit(1);
  }

  const property = await prisma.propertyCurrent.findUnique({
    where: { codigo: session.propertyCode },
    select: { ciudad: true, zona: true },
  });

  let direccionPdf = session.direccion;
  if (property) {
    const snapshot = await prisma.propertySnapshot.findFirst({
      where: { codigo: session.propertyCode },
      orderBy: { lastSeenAt: "desc" },
      select: { raw: true },
    });
    if (snapshot?.raw && typeof snapshot.raw === "object") {
      const direccionDesdeRaw = extractDireccionFromRaw(
        snapshot.raw as Record<string, unknown>,
        { ciudad: property.ciudad, zona: property.zona },
      );
      if (direccionDesdeRaw && direccionDesdeRaw.trim().length > 0) {
        direccionPdf = direccionDesdeRaw;
      }
    }
  }

  const comercial = await resolveComercial({
    comercialId: session.comercialId,
    requireActive: false,
  });
  const agenteName = comercial?.nombre ?? "URUS Capital Group";

  const horaPdf = session.visitDateTime.toLocaleTimeString("es-ES", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
  });

  console.log("[regen] Generando PDF con:", {
    direccion: direccionPdf,
    hora: horaPdf,
    nombre: session.buyerNombre,
    dni: session.buyerDni,
    telefono: session.buyerTelefono,
  });

  const pdfBuffer = await generateParteVisitaPdf({
    nombre: (session.buyerNombre ?? "").trim(),
    dni: (session.buyerDni ?? "").trim().toUpperCase(),
    telefono: (session.buyerTelefono ?? "").trim(),
    direccion: direccionPdf,
    tipoOperacion: session.tipoOperacion as "VENTA" | "ALQUILER",
    precio: session.precio,
    aceptaLopd: session.aceptaLopd ?? true,
    fecha: session.visitDateTime,
    hora: horaPdf,
    agente: agenteName,
  });

  const upload = await uploadContractDocument({
    buffer: pdfBuffer,
    fileName: `parte_visita_${session.propertyRef}.pdf`,
    folder: `parte-visita/${session.propertyCode}`,
    tags: ["parte_visita", session.propertyRef, "regenerated"],
    context: {
      propertyCode: session.propertyCode,
      sessionId: session.id,
      regeneratedAt: new Date().toISOString(),
    },
  });
  console.log("[regen] Subido a Cloudinary:", upload.secureUrl);

  const newHash = computeSha256(pdfBuffer);

  if (session.signatureRequestId) {
    await prisma.signatureRequest.update({
      where: { id: session.signatureRequestId },
      data: {
        cloudinaryUrl: upload.secureUrl,
        documentHash: newHash,
      },
    });
    console.log(
      "[regen] SignatureRequest actualizada:",
      session.signatureRequestId,
    );
  }

  if (session.legalDocumentId) {
    await prisma.legalDocument.update({
      where: { id: session.legalDocumentId },
      data: { cloudinaryUrl: upload.secureUrl },
    });
    console.log(
      "[regen] LegalDocument actualizado:",
      session.legalDocumentId,
    );
  }

  await prisma.parteVisitaSession.update({
    where: { id: session.id },
    data: { documentUrl: upload.secureUrl },
  });
  console.log("[regen] ParteVisitaSession.documentUrl actualizado");

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[regen] FAIL:", err);
  await prisma.$disconnect();
  process.exit(1);
});
