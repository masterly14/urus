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

export function extractRefCode(ref: string): string | null {
  const t = ref.trim();
  const std = t.match(REF_PATTERN_STD);
  if (std) return std[1].toUpperCase();
  const alt = t.match(REF_PATTERN_ALT);
  if (alt) return alt[3].toUpperCase();
  return null;
}
