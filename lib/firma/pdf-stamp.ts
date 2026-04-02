import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface StampParams {
  signerName: string;
  documentKind: string;
  operationId: string;
  signedAt: Date;
  signerIp: string;
  documentHash: string;
  consentText: string;
  signatureImage?: Buffer;
}

export async function stampSignaturePage(
  pdfBuffer: Buffer,
  params: StampParams,
): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBuffer);
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const page = doc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const margin = 50;
  let y = height - margin;

  const dateStr = params.signedAt.toLocaleString("es-ES", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const titleSize = 16;
  const bodySize = 10;
  const smallSize = 8;
  const lineHeight = bodySize * 1.6;
  const dark = rgb(0.1, 0.1, 0.1);
  const gray = rgb(0.4, 0.4, 0.4);

  page.drawText("CERTIFICADO DE FIRMA ELECTRÓNICA", {
    x: margin,
    y,
    size: titleSize,
    font: helveticaBold,
    color: dark,
  });
  y -= titleSize + 20;

  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 1,
    color: gray,
  });
  y -= 20;

  const lines = [
    `Firmante: ${params.signerName}`,
    `Documento: ${params.documentKind}`,
    `Operación: ${params.operationId}`,
    `Fecha y hora: ${dateStr}`,
    `Dirección IP: ${params.signerIp}`,
    `Hash SHA-256 del documento original:`,
    `  ${params.documentHash}`,
  ];

  for (const line of lines) {
    page.drawText(line, { x: margin, y, size: bodySize, font: helvetica, color: dark });
    y -= lineHeight;
  }

  y -= 10;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.5,
    color: gray,
  });
  y -= 20;

  if (params.signatureImage && params.signatureImage.length > 0) {
    page.drawText("Firma manuscrita:", {
      x: margin,
      y,
      size: bodySize,
      font: helveticaBold,
      color: dark,
    });
    y -= lineHeight;

    const sigImg = await doc.embedPng(params.signatureImage);
    const sigDims = sigImg.scale(1);
    const maxSigWidth = width - margin * 2;
    const maxSigHeight = 100;
    const scale = Math.min(maxSigWidth / sigDims.width, maxSigHeight / sigDims.height, 1);
    const sigWidth = sigDims.width * scale;
    const sigHeight = sigDims.height * scale;

    page.drawImage(sigImg, {
      x: margin,
      y: y - sigHeight,
      width: sigWidth,
      height: sigHeight,
    });
    y -= sigHeight + 15;

    page.drawLine({
      start: { x: margin, y },
      end: { x: margin + Math.max(sigWidth, 200), y },
      thickness: 0.5,
      color: gray,
    });
    y -= 4;
    page.drawText(params.signerName, {
      x: margin,
      y,
      size: smallSize,
      font: helvetica,
      color: gray,
    });
    y -= 20;
  }

  page.drawText("Declaración de consentimiento:", {
    x: margin,
    y,
    size: bodySize,
    font: helveticaBold,
    color: dark,
  });
  y -= lineHeight;

  const maxChars = 90;
  const consentLines = wrapText(params.consentText, maxChars);
  for (const line of consentLines) {
    page.drawText(line, { x: margin, y, size: bodySize, font: helvetica, color: dark });
    y -= lineHeight;
  }

  y -= 20;
  page.drawText(
    "Este documento ha sido firmado electrónicamente de forma simple conforme a la Ley 6/2020 (art. 3.1) y al Reglamento eIDAS (art. 25.1).",
    { x: margin, y, size: smallSize, font: helvetica, color: gray },
  );
  y -= smallSize + 4;
  page.drawText(
    "La firma electrónica no puede ser rechazada como prueba en juicio únicamente por su formato electrónico.",
    { x: margin, y, size: smallSize, font: helvetica, color: gray },
  );

  const stamped = await doc.save();
  return Buffer.from(stamped);
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length + word.length + 1 > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}
