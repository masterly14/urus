/**
 * Campo UI "Consultada" en la ficha de demanda Inmovilla: referencia del inmueble
 * asociado al cruce (p. ej. "Ref. URUS103VMA"). Sirve para resolver comercial vía
 * el mismo patrón que las refs de propiedad (extractRefCode → inmovillaRefCode).
 */

import { extractRefCode } from "@/lib/routing/parse-ref-code";

/** Claves habituales del API de listado / raw JSON (probar en orden). */
export const REF_CONSULTADA_FIELD_KEYS = [
  "consultada",
  "consultado",
  "refconsultada",
  "ref_consultada",
  "refconsultada_dem",
  "demandas-consultada",
  "demandas-consultado",
  "demandas-refconsultada",
  "demandas-ref_consultada",
  "demandasconsultada",
  "demandasconsultado",
  "textoconsultada",
  "textoconsultado",
  "texto_consultada",
  "texto_consultado",
  "refconsult",
  "refpropiedad",
  "demandas-refpropiedad",
  "ref_inmueble",
  "demandas-ref_inmueble",
  "cod_inmueble",
] as const;

/**
 * Normaliza un valor tipo "Ref. URUS103VMA" o "URUS103VMA" a la ref usable en extractRefCode.
 */
export function parseConsultadaPropertyRef(value: unknown): string | undefined {
  if (value == null) return undefined;
  let s = String(value).replace(/\s+/g, " ").trim();
  if (!s) return undefined;
  s = s.replace(/^(ref\.?|referencia\.?)\s*/i, "").trim();
  if (/^URUS/i.test(s) && extractRefCode(s)) return s;
  const std = s.match(/(URUS\d+[VA][A-Za-z0-9]+)/i);
  if (std && extractRefCode(std[1])) return std[1];
  const alt = s.match(/(URUS[VA]\d+[A-Za-z0-9]+)/i);
  if (alt && extractRefCode(alt[1])) return alt[1];
  return undefined;
}

export function extractRefConsultadaFromDemandMap(
  map: Record<string, unknown>,
): string | undefined {
  for (const key of REF_CONSULTADA_FIELD_KEYS) {
    const parsed = parseConsultadaPropertyRef(map[key]);
    if (parsed) return parsed;
  }
  return undefined;
}
