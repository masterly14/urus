/**
 * Reduce un HTML capturado de Fotocasa a un fixture compacto:
 *  - Mantiene la asignación `window.__INITIAL_PROPS__ = JSON.parse(...)` íntegra
 *    (es la fuente principal de datos para los parsers).
 *  - Mantiene los meta tags relevantes (title, description, og:image).
 *  - Mantiene los selectores DOM críticos (re-DetailHeader, re-DetailDescription,
 *    re-DetailMosaic, re-FormContactDetail-referenceAlias) para validar el
 *    fallback DOM.
 *  - Descarta scripts no críticos, hojas de estilo, SVGs grandes, traducciones
 *    de la app y todos los demás scripts que inflan el HTML sin aportar a tests.
 *
 * Uso:
 *   tsx scripts/fotocasa-fixture-shrink.ts <input.html> <output.html>
 */
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error("Usage: tsx scripts/fotocasa-fixture-shrink.ts <input.html> <output.html>");
  process.exit(1);
}

const [inputPath, outputPath] = args as [string, string];
const html = readFileSync(inputPath, "utf8");

const initialPropsMatch = html.match(
  /(window\.__INITIAL_PROPS__\s*=\s*JSON\.parse\(\s*'(?:\\'|[^'])*'\s*\))/,
);
if (!initialPropsMatch) {
  console.error("ERROR: __INITIAL_PROPS__ not found in input");
  process.exit(1);
}

const titleMatch = html.match(/<title>[^<]*<\/title>/);
const metaDescription = html.match(
  /<meta[^>]*\bname=["']description["'][^>]*content=["'][^"']{0,500}["'][^>]*>/i,
);
const ogImage = html.match(
  /<meta[^>]*\bproperty=["']og:image["'][^>]*content=["'][^"']{0,500}["'][^>]*>/i,
);

// Estos bloques DOM son los que prueba el fallback (cuando __INITIAL_PROPS__ no
// existe). Conservamos un pequeño extracto para que los tests que cubren ese
// camino sigan teniendo HTML representativo.
const captureBlocks: string[] = [];
const blockSelectors = [
  /<h1[^>]*\bclass=["'][^"']*\bre-DetailHeader-propertyTitle\b[^"']*["'][^>]*>[^<]*<\/h1>/i,
  /<p[^>]*\bclass=["'][^"']*\bre-DetailHeader-municipalityTitle\b[^"']*["'][^>]*>[^<]*<\/p>/i,
  /<p[^>]*\bclass=["'][^"']*\bre-DetailHeader-price\b[^"']*["'][^>]*>[^<]*<\/p>/i,
  /<div[^>]*\bclass=["'][^"']*\bre-DetailDescriptionContainer\b[^"']*["'][^>]*>[\s\S]{0,4000}?<\/div>/i,
  /<ul[^>]*\bclass=["'][^"']*\bre-FormContactDetail-referenceAlias\b[^"']*["'][^>]*>[\s\S]{0,200}?<\/ul>/i,
  /<button[^>]*\bdata-testid=["']view-phone-button["'][^>]*>[\s\S]{0,400}?<\/button>/i,
  /<section[^>]*\bdata-testid=["']mosaic-section["'][^>]*>[\s\S]{0,3000}?<\/section>/i,
];
for (const re of blockSelectors) {
  const m = html.match(re);
  if (m) captureBlocks.push(m[0]);
}

const head = [
  "<head>",
  '<meta charset="utf-8" />',
  titleMatch?.[0] ?? "<title>Fotocasa</title>",
  metaDescription?.[0] ?? "",
  ogImage?.[0] ?? "",
  "</head>",
].join("\n");

const body = [
  "<body>",
  ...captureBlocks,
  `<script>${initialPropsMatch[1]};</script>`,
  "</body>",
].join("\n");

const compact = `<!DOCTYPE html>\n<html lang="es">\n${head}\n${body}\n</html>\n`;

writeFileSync(outputPath, compact, "utf8");
console.log(`Wrote ${outputPath} (${compact.length} bytes, original ${html.length} bytes)`);
