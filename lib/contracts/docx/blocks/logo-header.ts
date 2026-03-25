import { AlignmentType, ImageRun, Paragraph, TextRun } from "docx";

const LOGO_URL =
  "https://res.cloudinary.com/dpryigxri/image/upload/v1774469752/Captura_de_pantalla_2026-03-25_151520_px4j4r.png";

const LOGO_WIDTH_PX = 260;
const LOGO_HEIGHT_PX = 150;

let cachedLogoBuffer: Buffer | null = null;

async function fetchLogoBuffer(): Promise<Buffer> {
  if (cachedLogoBuffer) return cachedLogoBuffer;
  const res = await fetch(LOGO_URL);
  if (!res.ok) throw new Error(`No se pudo descargar el logo: HTTP ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  cachedLogoBuffer = Buffer.from(arrayBuffer);
  return cachedLogoBuffer;
}

export async function buildLogoHeaderParagraphs(): Promise<Paragraph[]> {
  try {
    const buffer = await fetchLogoBuffer();
    return [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
        children: [
          new ImageRun({
            data: buffer,
            transformation: { width: LOGO_WIDTH_PX, height: LOGO_HEIGHT_PX },
            type: "png",
          }),
        ],
      }),
    ];
  } catch {
    return [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
        children: [
          new TextRun({
            text: "URUS CAPITAL GROUP",
            bold: true,
            size: 32,
            color: "1A365D",
            font: "Calibri",
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: "REAL ESTATE & INVESTMENTS",
            size: 18,
            color: "94A3B8",
            font: "Calibri",
          }),
        ],
      }),
    ];
  }
}
