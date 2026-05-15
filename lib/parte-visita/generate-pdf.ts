/**
 * PDF generation for Parte de Visita Inmobiliaria.
 *
 * Follows the physical document layout: header with URUS logo text,
 * date/time/agent metadata, visited property table, buyer data section
 * with operation type checkboxes, legal text (visit acknowledgement,
 * fees, LOPD), and electronic-signature note.
 *
 * Uses pdf-lib (same dependency as lib/nota-encargo/generate-pdf.ts).
 */

import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFPage,
  type PDFFont,
  type RGB,
} from "pdf-lib";

export interface ParteVisitaData {
  nombre: string;
  dni: string;
  telefono: string;
  direccion: string;
  tipoOperacion: "VENTA" | "ALQUILER";
  precio: number;
  fecha: Date;
  hora: string;
  agente: string;
  aceptaLopd: boolean;
}

const MARGIN = 50;
const HEADER_SIZE = 14;
const SUBHEADER_SIZE = 12;
const BODY_SIZE = 10;
const SMALL_SIZE = 8;

const DARK = rgb(0.1, 0.1, 0.1);
const GOLD = rgb(0.72, 0.58, 0.2);
const GRAY = rgb(0.4, 0.4, 0.4);
const WHITE = rgb(1, 1, 1);

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if ((current + " " + word).trim().length > maxChars && current) {
      lines.push(current.trim());
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}

function drawSectionHeader(
  page: PDFPage,
  title: string,
  x: number,
  y: number,
  width: number,
  font: PDFFont,
  color: RGB,
): number {
  const headerHeight = SUBHEADER_SIZE + 10;
  page.drawRectangle({
    x,
    y: y - headerHeight + 4,
    width: width - 2 * MARGIN,
    height: headerHeight,
    color: GOLD,
  });
  page.drawText(title, {
    x: x + 8,
    y: y - SUBHEADER_SIZE - 1,
    size: SUBHEADER_SIZE,
    font,
    color: WHITE,
  });
  return y - headerHeight - 6;
}

function drawField(
  page: PDFPage,
  label: string,
  value: string,
  x: number,
  y: number,
  fontRegular: PDFFont,
  fontBold: PDFFont,
  size: number,
  color: RGB,
): number {
  const lineHeight = size * 1.6;
  page.drawText(`${label}:`, { x, y, size, font: fontBold, color });
  page.drawText(value, { x: x + 120, y, size, font: fontRegular, color });
  return y - lineHeight;
}

function drawTableRow(
  page: PDFPage,
  cols: { text: string; x: number; width: number }[],
  y: number,
  font: PDFFont,
  size: number,
  color: RGB,
  rowHeight: number,
  border?: RGB,
): number {
  if (border) {
    const totalWidth = cols.reduce((sum, c) => sum + c.width, 0);
    page.drawRectangle({
      x: cols[0].x,
      y: y - rowHeight + 4,
      width: totalWidth,
      height: rowHeight,
      borderColor: border,
      borderWidth: 0.5,
      color: rgb(1, 1, 1),
    });
  }
  for (const col of cols) {
    page.drawText(col.text, {
      x: col.x + 4,
      y: y - size - 2,
      size,
      font,
      color,
    });
  }
  return y - rowHeight;
}

const VISIT_ACKNOWLEDGEMENT =
  "El interesado reconoce que NO ha visitado el inmueble anteriormente, y lo hace por primera vez en la fecha y hora del presente documento acompañado del agente de la inmobiliaria URUS CAPITAL GROUP S.L.";

const INTERMEDIATION_CLAUSE =
  "Las partes se comprometen a no hacer uso de esta información para sí mismo o por medio de terceros al margen de la inmobiliaria, respetando la intervención de la misma en calidad de intermediación en cualquier transacción que se realice durante los próximos dos años.";

const FEES_CLAUSE =
  "Los honorarios convenidos serán de 2,5% más IVA del precio de venta con un mínimo de 3.500€ más IVA, y en caso de alquiler de una mensualidad de la renta más IVA, estos serán abonados el día del contrato de arras en caso de compra y en el momento de la formalización del contrato en caso de alquiler. En caso de reclamación judicial de honorarios, esta se realizará por el total de la operación, incluyendo tanto los correspondientes al comprador como al vendedor.";

const CONSUMER_DECREE =
  "El cliente recibe en este acto toda la información a que se refiere el Decreto 218/05, de 11 de octubre, por el que se aprueba el Reglamento de información al consumidor en la compraventa y arrendamiento de vivienda en Andalucía.";

const LOPD_TEXT =
  "La parte contratante se compromete y da su consentimiento expreso para el tratamiento de cuantos datos personales haya facilitado a URUS CAPITAL GROUP S.L. con número de CIF: B55460976. Representada por Miguel Angel Carrillo Ramos con DNI: 46266189Y y domicilio en: Plaza de la Albolafia 4c 2º3, que según el RGPD 2016/679 de protección de datos de carácter personal como responsable de tratamiento, de acuerdo con las siguientes especificaciones. Los datos proporcionados e incluirán en el fichero de registro de URUS CAPITAL GROUP S.L., y se conservarán mientras se mantenga la relación comercial durante los años necesarios para cumplir con las obligaciones legales vigentes. Los datos no excederán a terceros, salvo que exista una obligación legal. Cualquier otro uso de los datos requerirá un nuevo consentimiento. La información facilitada será tratada exclusivamente con las siguientes finalidades: Prestación de servicio, Emisión de recibos, Comunicaciones relacionadas con el servicio de nuestra empresa. Como titular del contrato usted podrá ejercitar los derechos de acceso, rectificación, presión y portabilidad de sus datos, y la limitación a su tratamiento, a retirar el consentimiento prestado y a reclamar a la AEPD, ante URUS CAPITAL GROUP.";

export async function generateParteVisitaPdf(
  data: ParteVisitaData,
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const lineHeight = BODY_SIZE * 1.6;
  let y = height - MARGIN;

  // --- HEADER ---
  page.drawText("URUS CAPITAL GROUP S.L.", {
    x: MARGIN,
    y,
    size: HEADER_SIZE,
    font: helveticaBold,
    color: GOLD,
  });

  page.drawText("Parte de Visita Inmobiliaria", {
    x: width - MARGIN - 200,
    y,
    size: BODY_SIZE + 2,
    font: helveticaBold,
    color: DARK,
  });
  y -= HEADER_SIZE + 4;

  const dateStr = data.fecha.toLocaleDateString("es-ES", {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const metaRight = width - MARGIN - 200;
  page.drawText(`FECHA: ${dateStr}`, {
    x: metaRight,
    y,
    size: SMALL_SIZE,
    font: helvetica,
    color: GRAY,
  });
  y -= SMALL_SIZE * 1.5;
  page.drawText(`HORA: ${data.hora}`, {
    x: metaRight,
    y,
    size: SMALL_SIZE,
    font: helvetica,
    color: GRAY,
  });
  y -= SMALL_SIZE * 1.5;
  page.drawText(`AGENTE: ${data.agente}`, {
    x: metaRight,
    y,
    size: SMALL_SIZE,
    font: helvetica,
    color: GRAY,
  });
  y -= lineHeight + 6;

  // --- INMUEBLES VISITADOS ---
  y = drawSectionHeader(
    page,
    "Inmuebles Visitados",
    MARGIN,
    y,
    width,
    helveticaBold,
    GOLD,
  );

  const col1Width = (width - 2 * MARGIN) * 0.7;
  const col2Width = (width - 2 * MARGIN) * 0.3;
  const tableRowHeight = BODY_SIZE * 2.2;

  y = drawTableRow(
    page,
    [
      { text: "DIRECCIÓN", x: MARGIN, width: col1Width },
      { text: "PRECIO", x: MARGIN + col1Width, width: col2Width },
    ],
    y,
    helveticaBold,
    BODY_SIZE,
    DARK,
    tableRowHeight,
    GRAY,
  );

  const precioFmt = new Intl.NumberFormat("es-ES").format(data.precio) + " €";
  y = drawTableRow(
    page,
    [
      { text: data.direccion, x: MARGIN, width: col1Width },
      { text: precioFmt, x: MARGIN + col1Width, width: col2Width },
    ],
    y,
    helvetica,
    BODY_SIZE,
    DARK,
    tableRowHeight,
    GRAY,
  );
  y -= 12;

  // --- DATOS DEL INTERESADO ---
  y = drawSectionHeader(
    page,
    "Datos del Interesado",
    MARGIN,
    y,
    width,
    helveticaBold,
    GOLD,
  );

  // Operation type checkboxes
  const ventaCheck = data.tipoOperacion === "VENTA" ? "[X]" : "[ ]";
  const alquilerCheck = data.tipoOperacion === "ALQUILER" ? "[X]" : "[ ]";
  page.drawText("OPERACIÓN:", {
    x: MARGIN,
    y,
    size: BODY_SIZE,
    font: helveticaBold,
    color: DARK,
  });
  page.drawText(`${ventaCheck} VENTA`, {
    x: MARGIN + 100,
    y,
    size: BODY_SIZE,
    font: helvetica,
    color: DARK,
  });
  page.drawText(`${alquilerCheck} ALQUILER`, {
    x: MARGIN + 200,
    y,
    size: BODY_SIZE,
    font: helvetica,
    color: DARK,
  });
  y -= lineHeight + 2;

  y = drawField(
    page,
    "NOMBRE",
    data.nombre,
    MARGIN,
    y,
    helvetica,
    helveticaBold,
    BODY_SIZE,
    DARK,
  );
  y = drawField(
    page,
    "DNI",
    data.dni,
    MARGIN,
    y,
    helvetica,
    helveticaBold,
    BODY_SIZE,
    DARK,
  );
  y = drawField(
    page,
    "TELÉFONO",
    data.telefono,
    MARGIN,
    y,
    helvetica,
    helveticaBold,
    BODY_SIZE,
    DARK,
  );
  y -= 10;

  // --- LEGAL TEXT ---
  const legalClauses = [
    VISIT_ACKNOWLEDGEMENT,
    INTERMEDIATION_CLAUSE,
    FEES_CLAUSE,
    CONSUMER_DECREE,
  ];

  for (const clause of legalClauses) {
    page.drawText("-", {
      x: MARGIN,
      y,
      size: SMALL_SIZE,
      font: helvetica,
      color: DARK,
    });
    const wrapped = wrapText(clause, 95);
    for (const line of wrapped) {
      page.drawText(line, {
        x: MARGIN + 8,
        y,
        size: SMALL_SIZE,
        font: helvetica,
        color: DARK,
      });
      y -= SMALL_SIZE * 1.4;
    }
    y -= 3;
  }
  y -= 6;

  // --- LOPD ---
  page.drawText("Cláusula de tratamiento de datos:", {
    x: MARGIN,
    y,
    size: BODY_SIZE,
    font: helveticaBold,
    color: DARK,
  });
  y -= lineHeight;

  const lopdWrapped = wrapText(LOPD_TEXT, 95);
  for (const line of lopdWrapped) {
    page.drawText(line, {
      x: MARGIN,
      y,
      size: SMALL_SIZE - 0.5,
      font: helvetica,
      color: DARK,
    });
    y -= (SMALL_SIZE - 0.5) * 1.4;
  }
  y -= 8;

  // --- SI / NO ---
  const lopdCheck = data.aceptaLopd ? "SÍ ( X )  NO (   )" : "SÍ (   )  NO ( X )";
  page.drawText(lopdCheck, {
    x: width - MARGIN - 130,
    y,
    size: BODY_SIZE,
    font: helveticaBold,
    color: DARK,
  });
  y -= lineHeight + 16;

  // --- FIRMA ELECTRONICA ---
  page.drawText("Documento firmado electronicamente. Ver certificado adjunto.", {
    x: MARGIN,
    y,
    size: BODY_SIZE,
    font: helvetica,
    color: GRAY,
  });

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}
