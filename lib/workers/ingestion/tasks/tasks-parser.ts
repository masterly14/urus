/**
 * Parsers for Inmovilla task data: listing rows and `descrip` HTML observations.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RawTask {
  codigo: string;
  fecha: string;
  hora: string;
  nombreSeguimiento: string;
  asunto: string;
  nombreAgente: string;
  referenciaPropiedad: string;
  codigoPropiedad: string;
  codigoDemanda: string;
  duracion: string;
  keypadre: string;
}

export interface TaskDetail {
  codseg: number;
  asunto: string;
  descrip: string;
  keyagente: number;
  keytiposeg: number;
  fechaaviso: string;
  fechaalta: string;
  tareacerrada: number;
  keyofe: number;
  duracion: number;
  confirmado: number;
  altaagente: number;
  keyagente_nombre: string;
  keyagente_apellidos: string;
}

export interface ParsedDescrip {
  ref: string;
  phone: string;
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&rarr;/g, "→")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// ---------------------------------------------------------------------------
// Listing row parser
// ---------------------------------------------------------------------------

export function parseTaskRow(
  fields: Array<{ campo: string; value: string }>,
): RawTask {
  const map: Record<string, string> = {};
  for (const f of fields) map[f.campo] = f.value;
  return {
    codigo: map.codigo ?? "",
    fecha: map.fecha ?? "",
    hora: map.hora ?? "",
    nombreSeguimiento: decodeHtmlEntities(map.nombreSeguimiento ?? ""),
    asunto: decodeHtmlEntities(map.asunto ?? ""),
    nombreAgente: map.nombreAgente ?? "",
    referenciaPropiedad: map.referenciaPropiedad ?? "",
    codigoPropiedad: map.codigoPropiedad ?? "0",
    codigoDemanda: map.codigoDemanda ?? "0",
    duracion: map.duracion ?? "1",
    keypadre: map.keypadre ?? "",
  };
}

// ---------------------------------------------------------------------------
// Captación detection (listing level — by name, keytiposeg only in detail)
// ---------------------------------------------------------------------------

const CAPTACION_NOMBRE = "Reportaje Fotográfico";

export function isCaptacionTask(task: RawTask): boolean {
  return task.nombreSeguimiento.includes(CAPTACION_NOMBRE);
}

// ---------------------------------------------------------------------------
// Detail-level validation
// ---------------------------------------------------------------------------

export function isValidCaptacionDetail(detail: TaskDetail): boolean {
  const asuntoLower = detail.asunto.toLowerCase();
  const asuntoOk =
    asuntoLower.includes("captación") ||
    asuntoLower.includes("captacion") ||
    detail.asunto.trim() === "";

  const parsed = parseNotaEncargoDescrip(detail.descrip);
  const abierta = detail.tareacerrada === 0;

  return asuntoOk && parsed !== null && abierta;
}

// ---------------------------------------------------------------------------
// Descrip (observations) HTML parser
// ---------------------------------------------------------------------------

export function parseNotaEncargoDescrip(
  descrip: string,
): ParsedDescrip | null {
  let text = descrip.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<[^>]+>/g, "");
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

  const lines = text
    .split(/[\n\r]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return null;

  const refMatch = lines[0].match(/^(URUS\w+)$/i);
  if (!refMatch) return null;

  const phoneLine = lines[1].replace(/^~/, "").replace(/\s+/g, "");
  const phoneMatch = phoneLine.match(/^(\d{9,15})$/);
  if (!phoneMatch) return null;

  return {
    ref: refMatch[1].toUpperCase(),
    phone: phoneMatch[1],
  };
}

// ---------------------------------------------------------------------------
// Property data extraction from PropertySnapshot.raw
// ---------------------------------------------------------------------------

export function extractPropertyDataFromRaw(
  raw: Record<string, unknown>,
  propertyCurrent: { ciudad: string; zona: string },
): {
  direccion: string;
  tipoOperacion: "VENTA" | "ALQUILER";
  precio: number;
} {
  const calle = String(raw.calle ?? "").trim();
  const numero = String(raw.numero ?? "").trim();
  const cp = String(raw.cp ?? "").trim();

  const direccion = [
    calle && numero
      ? `Calle ${calle}, ${numero}`
      : calle
        ? `Calle ${calle}`
        : "",
    propertyCurrent.zona,
    propertyCurrent.ciudad,
    cp,
  ]
    .filter(Boolean)
    .join(", ");

  const precioinmo = Number(raw.precioinmo) || 0;
  const precioalq = Number(raw.precioalq) || 0;
  const tipoOperacion: "VENTA" | "ALQUILER" =
    precioalq > 0 && precioinmo === 0 ? "ALQUILER" : "VENTA";
  const precio = tipoOperacion === "ALQUILER" ? precioalq : precioinmo;

  return { direccion, tipoOperacion, precio };
}
