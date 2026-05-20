import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import JSZip from "jszip";

const LETTER_WIDTH_DXA = "12240";
const LETTER_HEIGHT_DXA = "15840";
const ONE_INCH_DXA = "1440";

interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

function parseArgv(argv: string[]) {
  let strict = false;
  let filePath: string | null = null;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--strict") {
      strict = true;
      continue;
    }
    if (!filePath) {
      filePath = arg;
    }
  }

  return { strict, filePath };
}

function getXmlAttr(tag: string, attrName: string): string | null {
  const pattern = new RegExp(`${attrName}="([^"]+)"`);
  const match = tag.match(pattern);
  return match?.[1] ?? null;
}

function validateSectionProps(documentXml: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const sectPrBlocks = documentXml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/g) ?? [];
  if (sectPrBlocks.length === 0) {
    errors.push("No se encontraron bloques <w:sectPr> en word/document.xml.");
    return { ok: false, errors, warnings };
  }

  sectPrBlocks.forEach((block, index) => {
    const pgSzTag = block.match(/<w:pgSz[^>]*\/>/)?.[0] ?? null;
    const pgMarTag = block.match(/<w:pgMar[^>]*\/>/)?.[0] ?? null;

    if (!pgSzTag) {
      errors.push(`Sección ${index + 1}: falta <w:pgSz>.`);
    } else {
      const width = getXmlAttr(pgSzTag, "w:w");
      const height = getXmlAttr(pgSzTag, "w:h");
      if (width !== LETTER_WIDTH_DXA || height !== LETTER_HEIGHT_DXA) {
        warnings.push(
          `Sección ${index + 1}: tamaño de página ${width ?? "?"}x${height ?? "?"} (esperado ${LETTER_WIDTH_DXA}x${LETTER_HEIGHT_DXA}).`,
        );
      }
    }

    if (!pgMarTag) {
      errors.push(`Sección ${index + 1}: falta <w:pgMar>.`);
    } else {
      const top = getXmlAttr(pgMarTag, "w:top");
      const right = getXmlAttr(pgMarTag, "w:right");
      const bottom = getXmlAttr(pgMarTag, "w:bottom");
      const left = getXmlAttr(pgMarTag, "w:left");
      const hasOneInchMargins =
        top === ONE_INCH_DXA &&
        right === ONE_INCH_DXA &&
        bottom === ONE_INCH_DXA &&
        left === ONE_INCH_DXA;
      if (!hasOneInchMargins) {
        warnings.push(
          `Sección ${index + 1}: márgenes top/right/bottom/left = ${top ?? "?"}/${right ?? "?"}/${bottom ?? "?"}/${left ?? "?"} (esperado ${ONE_INCH_DXA}).`,
        );
      }
    }
  });

  return { ok: errors.length === 0, errors, warnings };
}

async function main() {
  const { strict, filePath } = parseArgv(process.argv);
  if (!filePath) {
    console.error("Uso: npx tsx scripts/validate-contract-docx.ts <archivo.docx> [--strict]");
    process.exit(1);
  }

  const absPath = resolve(process.cwd(), filePath);
  const buffer = await readFile(absPath);

  if (buffer.subarray(0, 2).toString("utf8") !== "PK") {
    console.error("El archivo no parece un ZIP DOCX válido (firma PK ausente).");
    process.exit(1);
  }

  const zip = await JSZip.loadAsync(buffer);
  const docXmlEntry = zip.file("word/document.xml");
  if (!docXmlEntry) {
    console.error("Falta word/document.xml en el DOCX.");
    process.exit(1);
  }

  const documentXml = await docXmlEntry.async("string");
  const result = validateSectionProps(documentXml);

  if (result.errors.length > 0) {
    console.error("Errores:");
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
  }

  if (result.warnings.length > 0) {
    console.warn("Advertencias:");
    for (const warning of result.warnings) {
      console.warn(`- ${warning}`);
    }
  }

  if (result.errors.length > 0 || (strict && result.warnings.length > 0)) {
    process.exit(1);
  }

  console.log(
    `Validación DOCX OK (${result.warnings.length} advertencia${result.warnings.length === 1 ? "" : "s"}).`,
  );
}

void main();
