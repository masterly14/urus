/**
 * Extrae las iniciales del comercial de una referencia Inmovilla.
 *
 * Patrón estándar: URUS{dígitos}{V|A}{iniciales}
 *   - "URUS111VMA" → "MA", "URUS09VFEDE" → "FEDE"
 *
 * Variante Inmovilla: URUS{V|A}{dígitos}{iniciales}
 *   - "URUSV57MA" → "MA" (venta, nº 57, comercial MA)
 */

const REF_PATTERN_STD = /^URUS\d+[VA](.+)$/i;
const REF_PATTERN_ALT = /^URUS([VA])(\d+)(.+)$/i;

export type RefOperationType = "VENTA" | "ALQUILER";

function parseRef(ref: string):
  | { operationType: RefOperationType; refCode: string }
  | null {
  const t = normalizeRef(ref);
  const std = t.match(/^URUS\d+([VA])(.+)$/i);
  if (std) {
    return {
      operationType: std[1].toUpperCase() === "A" ? "ALQUILER" : "VENTA",
      refCode: std[2].toUpperCase(),
    };
  }

  const alt = t.match(REF_PATTERN_ALT);
  if (alt) {
    return {
      operationType: alt[1].toUpperCase() === "A" ? "ALQUILER" : "VENTA",
      refCode: alt[3].toUpperCase(),
    };
  }

  return null;
}

export function normalizeRef(ref: string): string {
  return ref.trim().toUpperCase();
}

export function extractRefCode(ref: string): string | null {
  const t = normalizeRef(ref);
  const std = t.match(REF_PATTERN_STD);
  if (std) return std[1].toUpperCase();
  const alt = t.match(REF_PATTERN_ALT);
  if (alt) return alt[3].toUpperCase();
  return null;
}

export function getOperationTypeFromRef(ref: string): RefOperationType | null {
  return parseRef(ref)?.operationType ?? null;
}

export function isValidRefFormat(ref: string): boolean {
  return parseRef(ref) !== null;
}
