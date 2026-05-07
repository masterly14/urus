/**
 * Normalización canónica de listings de mercado.
 *
 * Convierte un `RawListing` (lo que captura el Worker desde un portal) en un
 * `CanonicalListing` (forma única de dominio sobre la que opera el resto del
 * pipeline: identidad, diff, snapshot, reglas).
 *
 * Reglas (ver docs/core-sistema-mercado.md, sección "Reglas de negocio"):
 *  - Si un valor numérico no es parseable, se guarda `null`.
 *  - Si hay conflicto entre detalle y listado, prioriza detalle.
 *  - `price <= 0` se descarta como precio (queda `null`).
 *  - Las comparaciones de texto geográficas usan forma normalizada NFD.
 *  - Tipología y operación se mapean a vocabularios cerrados.
 *
 * El módulo es **puro** (sin I/O ni dependencias de Prisma). Todos los
 * cálculos se hacen sobre los inputs; idóneo para tests unitarios y reproceso.
 */

import type {
  CanonicalListing,
  MarketHousingType,
  MarketListingStatus,
  MarketOperation,
  MarketSource,
  RawListing,
  RawListingPayload,
} from "./types";

// ---------------------------------------------------------------------------
// Utilidades de string/number
// ---------------------------------------------------------------------------

const PRICE_RE = /(\d{1,3}(?:[.\s]\d{3})+|\d{3,9})/;
const SURFACE_RE = /(\d{1,4})\s*m(?:²|2)?/i;
const ROOMS_RE = /(\d{1,2})\s*(?:hab\.?|habs\.?|habitaciones?|dormitorios?)/i;
const BATHROOMS_RE = /(\d{1,2})\s*(?:ba(?:ñ|n)os?)/i;

export function normalizeText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function parseSpanishNumber(value: string | undefined | null): number | null {
  if (value == null) return null;
  const cleaned = String(value).replace(/[€\s]/g, "").replace(/\./g, "").replace(",", ".");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function extractFirstNumber(text: string | undefined, regex: RegExp): number | null {
  if (!text) return null;
  const match = collapseWhitespace(text).match(regex);
  if (!match) return null;
  return parseSpanishNumber(match[1]);
}

export function extractPrice(text: string | undefined): number | null {
  if (!text) return null;
  const match = collapseWhitespace(text).match(PRICE_RE);
  if (!match) return null;
  const value = parseSpanishNumber(match[1]);
  return value != null && value > 0 ? value : null;
}

// ---------------------------------------------------------------------------
// Canonicalización de URL
// ---------------------------------------------------------------------------

const NOISE_QUERY_KEYS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "mkwid",
  "from",
  "stc",
  "ordenado-por",
  "adid",
]);

export function canonicalizeUrl(url: string, fallbackOrigin?: string): string {
  // Si la URL no es absoluta y no se proporciona un fallback explícito,
  // devolvemos el input tal cual: nunca inventamos un origen para no
  // ensuciar la identidad del listing.
  const isAbsolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(url);
  if (!isAbsolute && !fallbackOrigin) return url;

  try {
    const parsed = new URL(url, fallbackOrigin);
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (NOISE_QUERY_KEYS.has(key.toLowerCase())) {
        parsed.searchParams.delete(key);
      }
    }
    // Quitar trailing slash final salvo que sea root.
    let out = parsed.toString();
    if (out.endsWith("/") && parsed.pathname !== "/") {
      out = out.slice(0, -1);
    }
    return out;
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// Mapeos a vocabulario canónico
// ---------------------------------------------------------------------------

const HOUSING_MAP: Record<string, MarketHousingType> = {
  piso: "flat",
  apartamento: "flat",
  flat: "flat",
  estudio: "studio",
  studio: "studio",
  loft: "loft",
  atico: "penthouse",
  penthouse: "penthouse",
  duplex: "duplex",
  chalet: "house",
  casa: "house",
  unifamiliar: "house",
  adosado: "house",
  pareado: "house",
  bungalow: "house",
  villa: "house",
  finca: "countryhouse",
  cortijo: "countryhouse",
  countryhouse: "countryhouse",
  local: "premises",
  premises: "premises",
  oficina: "office",
  office: "office",
  nave: "warehouse",
  warehouse: "warehouse",
  almacen: "storage",
  storage: "storage",
  trastero: "storage",
  garaje: "garage",
  garage: "garage",
  parking: "garage",
  solar: "land",
  terreno: "land",
  parcela: "land",
  land: "land",
  edificio: "building",
  building: "building",
  habitacion: "room",
  room: "room",
};

export function mapHousingType(input: string | null | undefined): MarketHousingType {
  const normalized = normalizeText(input);
  if (!normalized) return "flat";
  if (HOUSING_MAP[normalized]) return HOUSING_MAP[normalized];

  // Coincidencia parcial (ej. "piso de 2 habs", "ático con terraza").
  for (const key of Object.keys(HOUSING_MAP)) {
    if (normalized.includes(key)) return HOUSING_MAP[key];
  }
  return "flat";
}

const OPERATION_MAP: Record<string, MarketOperation> = {
  venta: "sale",
  comprar: "sale",
  sale: "sale",
  alquiler: "rent",
  alquilar: "rent",
  rent: "rent",
};

export function mapOperation(
  input: string | null | undefined,
  fallback: MarketOperation = "sale",
): MarketOperation {
  const normalized = normalizeText(input);
  if (!normalized) return fallback;
  if (OPERATION_MAP[normalized]) return OPERATION_MAP[normalized];
  for (const key of Object.keys(OPERATION_MAP)) {
    if (normalized.includes(key)) return OPERATION_MAP[key];
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Geohash (implementación mínima sin dependencias)
// ---------------------------------------------------------------------------

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/**
 * Calcula el geohash de un punto (lat, lng) con `precision` caracteres.
 * Implementación de referencia (sin lib externa). Suficiente para clustering
 * por proximidad en el resolver de identidad.
 */
export function geohashEncode(
  lat: number,
  lng: number,
  precision = 7,
): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  if (precision < 1) return "";

  let latRange: [number, number] = [-90, 90];
  let lngRange: [number, number] = [-180, 180];
  let isLng = true;
  let bit = 0;
  let ch = 0;
  let geohash = "";

  while (geohash.length < precision) {
    if (isLng) {
      const mid = (lngRange[0] + lngRange[1]) / 2;
      if (lng >= mid) {
        ch = (ch << 1) | 1;
        lngRange = [mid, lngRange[1]];
      } else {
        ch = ch << 1;
        lngRange = [lngRange[0], mid];
      }
    } else {
      const mid = (latRange[0] + latRange[1]) / 2;
      if (lat >= mid) {
        ch = (ch << 1) | 1;
        latRange = [mid, latRange[1]];
      } else {
        ch = ch << 1;
        latRange = [latRange[0], mid];
      }
    }
    isLng = !isLng;
    bit++;
    if (bit === 5) {
      geohash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }

  return geohash;
}

// ---------------------------------------------------------------------------
// Función principal: normalizeRawListing
// ---------------------------------------------------------------------------

export interface NormalizeContext {
  /** Operación esperada del seed que originó la captura. */
  defaultOperation: MarketOperation;
  /** Ciudad canónica del seed (string normalizable). */
  defaultCity: string;
  /** Zona del seed si existe. */
  defaultZone?: string | null;
  /** Si se conoce, usar este timestamp como `firstSeenAt` en alta. */
  now?: Date;
}

export interface NormalizeResult {
  ok: true;
  listing: CanonicalListing;
}

export interface NormalizeRejected {
  ok: false;
  reason:
    | "missing_external_id"
    | "missing_url"
    | "missing_city"
    | "invalid_payload";
  detail?: string;
}

/**
 * Convierte una `RawListing` en `CanonicalListing`. Si los datos son
 * insuficientes para identificarla (sin id externo o sin URL), devuelve
 * `NormalizeRejected` con motivo. Esto evita ensuciar el snapshot con
 * filas inservibles.
 *
 * NOTA: el `qualityScore` y los `qualityFlags` se calculan en
 * `lib/market/quality.ts` para mantener responsabilidades separadas.
 * Aquí se devuelven con valores neutros (`0` / `[]`) y el caller los rellena.
 */
export function normalizeRawListing(
  raw: RawListing,
  ctx: NormalizeContext,
): NormalizeResult | NormalizeRejected {
  if (!raw || !raw.payload) {
    return { ok: false, reason: "invalid_payload" };
  }
  if (!raw.canonicalUrl) {
    return { ok: false, reason: "missing_url" };
  }
  if (!raw.externalId) {
    return { ok: false, reason: "missing_external_id" };
  }

  const city = normalizeCityName(
    raw.payload.cityRaw ?? ctx.defaultCity,
    ctx.defaultCity,
  );
  if (!city) {
    return { ok: false, reason: "missing_city" };
  }

  const operation = mapOperation(raw.payload.operationRaw, ctx.defaultOperation);
  const housingType = mapHousingType(raw.payload.housingRaw);

  const text = collapseWhitespace(raw.payload.rawText ?? "");

  // Política: precio <= 0 se trata como ausente. Mantenemos el listing en
  // inventario técnico pero no participa en filtros de rango.
  const rawPrice =
    parseSpanishNumber(raw.payload.priceRaw) ??
    extractPrice(text) ??
    null;
  const price = rawPrice != null && rawPrice > 0 ? rawPrice : null;

  const builtArea =
    parseSpanishNumber(raw.payload.surfaceRaw) ??
    extractFirstNumber(text, SURFACE_RE) ??
    null;

  const rooms =
    intOrNull(parseSpanishNumber(raw.payload.roomsRaw)) ??
    intOrNull(extractFirstNumber(text, ROOMS_RE));

  const bathrooms =
    intOrNull(parseSpanishNumber(raw.payload.bathroomsRaw)) ??
    intOrNull(extractFirstNumber(text, BATHROOMS_RE));

  const floor = raw.payload.floorRaw ? collapseWhitespace(raw.payload.floorRaw) : null;

  const zone =
    normalizeZoneName(raw.payload.zoneRaw) ?? (ctx.defaultZone ?? null) ?? null;

  const lat = numberOrNull(raw.payload.lat);
  const lng = numberOrNull(raw.payload.lng);
  const geohash = lat != null && lng != null ? geohashEncode(lat, lng, 7) : null;

  const pricePerMeter =
    price != null && builtArea != null && builtArea > 0
      ? round2(price / builtArea)
      : null;

  const status: MarketListingStatus = "active";

  const now = (ctx.now ?? new Date()).toISOString();

  const listing: CanonicalListing = {
    source: raw.source as MarketSource,
    externalId: raw.externalId,
    canonicalUrl: canonicalizeUrl(raw.canonicalUrl),

    operation,
    housingType,
    status,

    price,
    currency: "EUR",
    pricePerMeter,

    builtArea: builtArea != null && builtArea > 0 ? round2(builtArea) : null,
    rooms,
    bathrooms,
    floor,

    city,
    zone,
    addressApprox: raw.payload.addressRaw ? collapseWhitespace(raw.payload.addressRaw) : null,
    lat,
    lng,
    geohash,

    advertiserType: raw.payload.advertiserType ?? null,
    advertiserName: raw.payload.advertiserName ?? null,
    phones: dedupeStrings(raw.payload.phones ?? []),

    mainImageUrl: raw.payload.mainImageUrl ?? null,
    imageUrls: dedupeStrings(raw.payload.imageUrls ?? []).slice(0, 30),

    qualityScore: 0,
    qualityFlags: [],

    propertyId: null,

    firstSeenAt: now,
    lastSeenAt: now,
    lastChangeAt: null,
  };

  return { ok: true, listing };
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function normalizeCityName(input: string | null | undefined, fallback?: string): string {
  const candidate = (input ?? fallback ?? "").toString().trim();
  if (!candidate) return "";
  return candidate
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeZoneName(input: string | null | undefined): string | null {
  if (!input) return null;
  const cleaned = input.toString().replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned;
}

function intOrNull(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.trunc(value);
}

function numberOrNull(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function dedupeStrings(arr: string[]): string[] {
  return [...new Set(arr.filter((v) => typeof v === "string" && v.length > 0))];
}

// ---------------------------------------------------------------------------
// Re-exports útiles
// ---------------------------------------------------------------------------

export { type RawListing, type RawListingPayload };
