/**
 * Resolución de identidad cross-portal del Core de Mercado.
 *
 * Maneja dos niveles de identidad:
 *
 *  1. **Listing identity:** identidad estable del anuncio dentro de un portal.
 *     Se cubre con el unique (source, externalId) en DB; este módulo no la
 *     calcula, solo la consume.
 *
 *  2. **Property identity:** identidad probabilística del inmueble subyacente
 *     entre portales. Aquí se calcula:
 *       - `fingerprint`: clave determinística de agrupación rápida.
 *       - `similarity`: score blando para decidir merge/manual/no-merge.
 *
 * Política activa (ver docs/core-sistema-mercado-decisiones.md, §4):
 *   - score >= 0.90 → auto-merge
 *   - 0.70 <= score < 0.90 → revisión manual
 *   - score < 0.70 → no se vincula
 *
 * Módulo **puro** (sin I/O ni Prisma). Apto para tests unitarios.
 */

import { createHash } from "node:crypto";
import { normalizeText } from "./normalize";
import type { PropertyFingerprintInput, PropertySimilarityResult } from "./types";

// ---------------------------------------------------------------------------
// Umbrales
// ---------------------------------------------------------------------------

export const IDENTITY_AUTO_MERGE_THRESHOLD = 0.9;
export const IDENTITY_MANUAL_REVIEW_THRESHOLD = 0.7;

// ---------------------------------------------------------------------------
// Fingerprint determinístico
// ---------------------------------------------------------------------------

/**
 * Calcula un fingerprint estable a partir de los rasgos físicos del inmueble.
 *
 * - Es **insensible** a precio, fotos, descripción y advertiser.
 * - Es **sensible** a ubicación, métrica básica y tipología.
 * - Bucketea `builtArea` en franjas de 5 m² para tolerar pequeñas diferencias
 *   de cómo cada portal reporta la superficie.
 * - Si no hay `geohash`, cae en `city|zone` normalizadas; el fingerprint sigue
 *   siendo válido pero menos discriminante.
 */
export function computePropertyFingerprint(input: PropertyFingerprintInput): string {
  const parts: string[] = [
    input.operation,
    input.housingType,
    normalizeText(input.city),
    normalizeText(input.zone ?? ""),
    input.geohash ? input.geohash.slice(0, 7) : "no-geo",
    bucketArea(input.builtArea),
    bucketRooms(input.rooms),
    bucketRooms(input.bathrooms),
    normalizeText(input.floor ?? ""),
    addressDigest(input.addressApprox),
  ];

  const raw = parts.join("|");
  return createHash("sha256").update(raw).digest("hex");
}

function bucketArea(area: number | null): string {
  if (area == null || !Number.isFinite(area) || area <= 0) return "area-?";
  const bucket = Math.floor(area / 5) * 5;
  return `area-${bucket}`;
}

function bucketRooms(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value < 0) return "n-?";
  return `n-${Math.trunc(value)}`;
}

/**
 * Comprime una dirección aproximada a una huella corta y normalizada para
 * incluirla en el fingerprint sin inflar la entropía.
 */
function addressDigest(addr: string | null): string {
  if (!addr) return "addr-?";
  const norm = normalizeText(addr).replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  if (!norm) return "addr-?";
  // Hash corto (10 hex chars) de la versión normalizada.
  return "addr-" + createHash("sha1").update(norm).digest("hex").slice(0, 10);
}

// ---------------------------------------------------------------------------
// Similitud para merge probabilístico
// ---------------------------------------------------------------------------

/**
 * Calcula la similitud entre dos candidatos para decidir si representan el
 * mismo inmueble físico publicado en distintos portales.
 *
 * Pesos (suman 1.0):
 *   - geo (geohash + city/zone)        0.30
 *   - área construida                  0.20
 *   - habitaciones                     0.15
 *   - baños                            0.10
 *   - planta                           0.05
 *   - dirección aproximada             0.10
 *   - tipología (housingType + op)     0.10
 *
 * Cualquier dimensión sin datos en uno de los dos candidatos contribuye 0.
 * Si la operación o la tipología difieren, el score se penaliza fuertemente
 * (es virtualmente imposible que sean el mismo inmueble si una es venta y
 * la otra alquiler, o si una es flat y la otra house).
 */
export function computePropertySimilarity(
  a: PropertyFingerprintInput,
  b: PropertyFingerprintInput,
): PropertySimilarityResult {
  // Penalización dura: distinta operación o tipología → no-merge inmediato.
  if (a.operation !== b.operation || a.housingType !== b.housingType) {
    return {
      score: 0,
      components: {
        geo: 0,
        area: 0,
        rooms: 0,
        bathrooms: 0,
        floor: 0,
        address: 0,
        housingType: 0,
      },
      decision: "no-merge",
    };
  }

  const components = {
    geo: scoreGeo(a, b),
    area: scoreArea(a.builtArea, b.builtArea),
    rooms: scoreInt(a.rooms, b.rooms),
    bathrooms: scoreInt(a.bathrooms, b.bathrooms),
    floor: scoreFloor(a.floor, b.floor),
    address: scoreAddress(a.addressApprox, b.addressApprox),
    housingType: 1, // ya validado arriba
  };

  const weighted =
    components.geo * 0.3 +
    components.area * 0.2 +
    components.rooms * 0.15 +
    components.bathrooms * 0.1 +
    components.floor * 0.05 +
    components.address * 0.1 +
    components.housingType * 0.1;

  const score = clamp01(weighted);
  return { score, components, decision: decideFromScore(score) };
}

function decideFromScore(score: number): PropertySimilarityResult["decision"] {
  if (score >= IDENTITY_AUTO_MERGE_THRESHOLD) return "auto-merge";
  if (score >= IDENTITY_MANUAL_REVIEW_THRESHOLD) return "manual-review";
  return "no-merge";
}

// ---------------------------------------------------------------------------
// Componentes de similitud
// ---------------------------------------------------------------------------

function scoreGeo(a: PropertyFingerprintInput, b: PropertyFingerprintInput): number {
  // Match por geohash (precisión 7 ≈ 150 m); si no, fallback city+zone.
  if (a.geohash && b.geohash) {
    if (a.geohash === b.geohash) return 1;
    // Match parcial por prefijo (precisión más laxa).
    const common = commonPrefixLen(a.geohash, b.geohash);
    if (common >= 6) return 0.8;
    if (common >= 5) return 0.5;
    if (common >= 4) return 0.25;
    return 0;
  }
  const sameCity = normalizeText(a.city) === normalizeText(b.city);
  if (!sameCity) return 0;
  const sameZone = normalizeText(a.zone ?? "") === normalizeText(b.zone ?? "");
  return sameZone ? 0.6 : 0.3;
}

function scoreArea(a: number | null, b: number | null): number {
  if (a == null || b == null || a <= 0 || b <= 0) return 0;
  const diff = Math.abs(a - b);
  const ref = Math.max(a, b);
  const pct = diff / ref;
  if (pct <= 0.02) return 1;
  if (pct <= 0.05) return 0.85;
  if (pct <= 0.1) return 0.6;
  if (pct <= 0.2) return 0.3;
  return 0;
}

function scoreInt(a: number | null, b: number | null): number {
  if (a == null || b == null) return 0;
  if (a === b) return 1;
  if (Math.abs(a - b) === 1) return 0.5;
  return 0;
}

function scoreFloor(a: string | null, b: string | null): number {
  const na = normalizeText(a ?? "");
  const nb = normalizeText(b ?? "");
  if (!na || !nb) return 0;
  return na === nb ? 1 : 0;
}

function scoreAddress(a: string | null, b: string | null): number {
  const na = normalizeText(a ?? "").replace(/[^a-z0-9 ]/g, "");
  const nb = normalizeText(b ?? "").replace(/[^a-z0-9 ]/g, "");
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  // Coincidencia parcial: una contiene a la otra (ej. detalle vs aproximada).
  if (na.includes(nb) || nb.includes(na)) return 0.7;
  // Coincidencia por tokens compartidos.
  const ta = new Set(na.split(" ").filter((t) => t.length >= 3));
  const tb = new Set(nb.split(" ").filter((t) => t.length >= 3));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  const ratio = shared / Math.max(ta.size, tb.size);
  return clamp01(ratio);
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

function commonPrefixLen(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i++;
  return i;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
