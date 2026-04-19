/**
 * PDF generation for Nota de Encargo Inmobiliaria.
 * Uses pdf-lib (same dependency as lib/firma/pdf-stamp.ts).
 */

import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont, type RGB } from "pdf-lib";

export interface NotaEncargoData {
  nombre: string;
  dni: string;
  telefono: string;
  domicilioFiscal: string;
  direccion: string;
  tipoOperacion: "VENTA" | "ALQUILER";
  precio: number;
  duracionMeses: number;
  tipoNota: "N1" | "N2" | "N3";
  aceptaLopd: boolean;
  fecha: Date;
  hora: string;
  agente: string;
}

const MARGIN = 50;
const HEADER_SIZE = 14;
const BODY_SIZE = 10;
const SMALL_SIZE = 8;

const DARK = rgb(0.1, 0.1, 0.1);
const GOLD = rgb(0.72, 0.58, 0.2);
const GRAY = rgb(0.4, 0.4, 0.4);

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
  page.drawLine({
    start: { x, y: y + 2 },
    end: { x: width - MARGIN, y: y + 2 },
    thickness: 0.5,
    color,
  });
  page.drawText(title, {
    x,
    y: y - BODY_SIZE,
    size: BODY_SIZE,
    font,
    color,
  });
  return y - BODY_SIZE - BODY_SIZE * 1.6;
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
  page.drawText(`${label}:`, {
    x,
    y,
    size,
    font: fontBold,
    color,
  });
  page.drawText(value, {
    x: x + 120,
    y,
    size,
    font: fontRegular,
    color,
  });
  return y - lineHeight;
}

const TIPOS_NOTA = [
  {
    key: "N1",
    label: "N1 — ABIERTA",
    desc: "El propietario podrá vender por sí mismo y de forma directa, o con la intervención de otro agente inmobiliario.",
  },
  {
    key: "N2",
    label: "N2 — AGENTE ÚNICO",
    desc: "El vendedor encarga en régimen de agente único a URUS CAPITAL GROUP S.L. la venta del inmueble.",
  },
  {
    key: "N3",
    label: "N3 — REPRESENTACIÓN",
    desc: "El propietario no podrá vender por sí mismo ni mediante otro agente inmobiliario el inmueble.",
  },
];

const CLAUSULAS = [
  "HONORARIOS: 2,5% sobre el precio de venta + IVA (mínimo 3.500€ + IVA), devengados en la firma de arras, en concepto de asesoramiento, mediación y gestión inmobiliaria.",
  "GASTOS Y TRIBUTOS: El inmueble se transmitirá libre de cargas, al corriente de comunidad y sin arrendatarios u ocupantes.",
  "JURISDICCIÓN: Las partes se someten expresamente al fuero de los Juzgados y Tribunales de Córdoba, con renuncia expresa a cualquier otro.",
];

const LOPD_TEXT =
  "La parte contratante se compromete y da su consentimiento expreso para el tratamiento de cuantos datos personales haya facilitado a URUS CAPITAL GROUP S.L. con número de CIF: B54560976. Representada por Miguel Angel Carrillo Ramos con DNI: 46266189Y y domicilio en: Plaza de la Albolafia 4 2º3, que según el RGPD 2016/679 de protección de datos de carácter personal como responsable de su tratamiento.";

export async function generateNotaEncargoPdf(
  data: NotaEncargoData,
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();

  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const lineHeight = BODY_SIZE * 1.6;
  let y = height - MARGIN;

  // --- HEADER ---
  page.drawText("NOTA DE ENCARGO INMOBILIARIA", {
    x: MARGIN,
    y,
    size: HEADER_SIZE,
    font: helveticaBold,
    color: DARK,
  });
  y -= HEADER_SIZE + 6;

  page.drawText("URUS CAPITAL GROUP S.L.", {
    x: MARGIN,
    y,
    size: BODY_SIZE,
    font: helveticaBold,
    color: GOLD,
  });
  y -= lineHeight;

  const dateStr = data.fecha.toLocaleDateString("es-ES");
  page.drawText(
    `Fecha: ${dateStr}   Hora: ${data.hora}   Agente: ${data.agente}`,
    {
      x: MARGIN,
      y,
      size: SMALL_SIZE,
      font: helvetica,
      color: GRAY,
    },
  );
  y -= lineHeight + 10;

  // --- DATOS DEL PROPIETARIO ---
  y = drawSectionHeader(
    page,
    "DATOS DEL PROPIETARIO",
    MARGIN,
    y,
    width,
    helveticaBold,
    GOLD,
  );
  y = drawField(page, "Nombre", data.nombre, MARGIN, y, helvetica, helveticaBold, BODY_SIZE, DARK);
  y = drawField(page, "DNI", data.dni, MARGIN, y, helvetica, helveticaBold, BODY_SIZE, DARK);
  y = drawField(page, "Teléfono", data.telefono, MARGIN, y, helvetica, helveticaBold, BODY_SIZE, DARK);
  y = drawField(page, "Domicilio fiscal", data.domicilioFiscal, MARGIN, y, helvetica, helveticaBold, BODY_SIZE, DARK);
  y -= 10;

  // --- DATOS DEL INMUEBLE ---
  const inmuebleTitle =
    data.tipoOperacion === "ALQUILER"
      ? "DATOS DEL INMUEBLE EN ALQUILER"
      : "DATOS DEL INMUEBLE A LA VENTA";
  y = drawSectionHeader(page, inmuebleTitle, MARGIN, y, width, helveticaBold, GOLD);
  y = drawField(page, "Dirección", data.direccion, MARGIN, y, helvetica, helveticaBold, BODY_SIZE, DARK);
  y = drawField(page, "Operación", data.tipoOperacion, MARGIN, y, helvetica, helveticaBold, BODY_SIZE, DARK);
  y = drawField(
    page,
    "Precio",
    `${new Intl.NumberFormat("es-ES").format(data.precio)} €`,
    MARGIN,
    y,
    helvetica,
    helveticaBold,
    BODY_SIZE,
    DARK,
  );
  y = drawField(page, "Duración", `${data.duracionMeses} meses`, MARGIN, y, helvetica, helveticaBold, BODY_SIZE, DARK);
  y -= 10;

  // --- TIPO DE NOTA ---
  y = drawSectionHeader(page, "TIPO DE NOTA DE ENCARGO", MARGIN, y, width, helveticaBold, GOLD);
  for (const tipo of TIPOS_NOTA) {
    const checked = data.tipoNota === tipo.key ? "[X]" : "[ ]";
    page.drawText(`${checked} ${tipo.label}`, {
      x: MARGIN,
      y,
      size: BODY_SIZE,
      font: helveticaBold,
      color: DARK,
    });
    y -= lineHeight;

    const wrapped = wrapText(tipo.desc, 85);
    for (const line of wrapped) {
      page.drawText(line, {
        x: MARGIN + 20,
        y,
        size: SMALL_SIZE,
        font: helvetica,
        color: GRAY,
      });
      y -= SMALL_SIZE * 1.5;
    }
    y -= 4;
  }
  y -= 6;

  // --- CLÁUSULAS ---
  for (const clausula of CLAUSULAS) {
    page.drawText("•", {
      x: MARGIN,
      y,
      size: BODY_SIZE,
      font: helvetica,
      color: DARK,
    });
    const wrapped = wrapText(clausula, 85);
    for (const line of wrapped) {
      page.drawText(line, {
        x: MARGIN + 12,
        y,
        size: SMALL_SIZE,
        font: helvetica,
        color: DARK,
      });
      y -= SMALL_SIZE * 1.5;
    }
    y -= 4;
  }
  y -= 10;

  // --- LOPD ---
  page.drawText("Cláusula de protección de datos:", {
    x: MARGIN,
    y,
    size: BODY_SIZE,
    font: helveticaBold,
    color: DARK,
  });
  y -= lineHeight;

  const lopdWrapped = wrapText(LOPD_TEXT, 90);
  for (const line of lopdWrapped) {
    page.drawText(line, {
      x: MARGIN,
      y,
      size: SMALL_SIZE,
      font: helvetica,
      color: DARK,
    });
    y -= SMALL_SIZE * 1.5;
  }
  y -= 10;

  const lopdCheck = data.aceptaLopd ? "SÍ (X)  NO ( )" : "SÍ ( )  NO (X)";
  page.drawText(lopdCheck, {
    x: width - MARGIN - 120,
    y,
    size: BODY_SIZE,
    font: helveticaBold,
    color: DARK,
  });
  y -= lineHeight + 20;

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
