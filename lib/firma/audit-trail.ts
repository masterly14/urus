import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface AuditTrailParams {
  operationId: string;
  documentKind: string;
  signerName: string;
  signerEmail: string;
  signerIp: string;
  signerUserAgent: string;
  consentText: string;
  documentHash: string;
  signedDocumentHash: string;
  sentAt: Date;
  openedAt?: Date | null;
  signedAt: Date;
  signatureImage?: Buffer;
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleString("es-ES", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export async function generateAuditTrailPdf(
  params: AuditTrailParams,
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const page = doc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const margin = 50;
  let y = height - margin;

  const titleSize = 16;
  const sectionSize = 12;
  const bodySize = 10;
  const smallSize = 8;
  const lineHeight = bodySize * 1.6;
  const dark = rgb(0.1, 0.1, 0.1);
  const gray = rgb(0.4, 0.4, 0.4);

  page.drawText("PISTA DE AUDITORÍA — FIRMA ELECTRÓNICA", {
    x: margin,
    y,
    size: titleSize,
    font: helveticaBold,
    color: dark,
  });
  y -= titleSize + 8;
  page.drawText(`Operación: ${params.operationId} — ${params.documentKind}`, {
    x: margin,
    y,
    size: bodySize,
    font: helvetica,
    color: gray,
  });
  y -= 20;

  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 1,
    color: gray,
  });
  y -= 20;

  function drawSection(title: string) {
    page.drawText(title, { x: margin, y, size: sectionSize, font: helveticaBold, color: dark });
    y -= sectionSize + 8;
  }

  function drawLine(text: string) {
    page.drawText(text, { x: margin + 10, y, size: bodySize, font: helvetica, color: dark });
    y -= lineHeight;
  }

  drawSection("1. Datos del firmante");
  drawLine(`Nombre: ${params.signerName}`);
  drawLine(`Email: ${params.signerEmail}`);
  drawLine(`Dirección IP: ${params.signerIp}`);
  drawLine(`User-Agent: ${params.signerUserAgent.slice(0, 100)}`);
  y -= 10;

  drawSection("2. Cronología del proceso");
  drawLine(`Envío a firma: ${fmtDate(params.sentAt)}`);
  drawLine(`Apertura del documento: ${fmtDate(params.openedAt)}`);
  drawLine(`Firma completada: ${fmtDate(params.signedAt)}`);
  y -= 10;

  drawSection("3. Integridad del documento");
  drawLine(`Hash SHA-256 del documento original:`);
  drawLine(`  ${params.documentHash}`);
  drawLine(`Hash SHA-256 del documento firmado:`);
  drawLine(`  ${params.signedDocumentHash}`);
  y -= 10;

  drawSection("4. Consentimiento aceptado");
  const maxChars = 85;
  const words = params.consentText.split(/\s+/);
  let currentLine = "";
  for (const word of words) {
    if (currentLine.length + word.length + 1 > maxChars) {
      drawLine(currentLine);
      currentLine = word;
    } else {
      currentLine = currentLine ? `${currentLine} ${word}` : word;
    }
  }
  if (currentLine) drawLine(currentLine);
  y -= 10;

  if (params.signatureImage && params.signatureImage.length > 0) {
    drawSection("5. Firma manuscrita capturada");
    const sigImg = await doc.embedPng(params.signatureImage);
    const sigDims = sigImg.scale(1);
    const maxSigWidth = width - margin * 2 - 20;
    const maxSigHeight = 80;
    const scale = Math.min(maxSigWidth / sigDims.width, maxSigHeight / sigDims.height, 1);
    const sigWidth = sigDims.width * scale;
    const sigHeight = sigDims.height * scale;

    page.drawImage(sigImg, {
      x: margin + 10,
      y: y - sigHeight,
      width: sigWidth,
      height: sigHeight,
    });
    y -= sigHeight + 15;
  }

  const legalSectionNum = params.signatureImage?.length ? "6" : "5";
  drawSection(`${legalSectionNum}. Validez legal`);
  page.drawText(
    "Firma electrónica simple conforme a la Ley 6/2020 (art. 3.1) y Reglamento (UE) 910/2014 (eIDAS, art. 25.1).",
    { x: margin + 10, y, size: smallSize, font: helvetica, color: gray },
  );
  y -= smallSize + 4;
  page.drawText(
    "No puede rechazarse como prueba en juicio únicamente por su formato electrónico.",
    { x: margin + 10, y, size: smallSize, font: helvetica, color: gray },
  );
  y -= smallSize + 4;
  page.drawText(
    `Documento generado automáticamente el ${fmtDate(new Date())}.`,
    { x: margin + 10, y, size: smallSize, font: helvetica, color: gray },
  );

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}
