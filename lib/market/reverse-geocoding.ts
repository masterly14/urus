/**
 * Reverse-geocoding para MarketListing — convierte el par (lat, lng) capturado
 * por los workers de portales en una dirección postal estructurada (calle,
 * número, código postal) lista para pre-rellenar formularios (Crear prospecto,
 * nota de encargo, etc.).
 *
 * - Proveedor: Google Geocoding API (server-side).
 * - Variable de entorno: `GOOGLE_MAPS_API_KEY` (server-only).
 *   Fallback a `NEXT_PUBLIC_GOOGLE_MAPS_KEY` solo si la primera no está definida,
 *   asumiendo que el comercial puede tener la clave pública del Static Maps ya
 *   provisionada.
 * - Cache: `kv_store` por listingId. La dirección de un listing es estable
 *   (el portal no la cambia), así que cacheamos indefinidamente; si el
 *   workflow re-localiza el listing y lat/lng cambian, invalidamos por
 *   comparación de coordenadas redondeadas a 5 decimales (~1 m).
 */

import { prisma } from "@/lib/prisma";

const CACHE_KEY_PREFIX = "market:listing:reverse-geocode:";
const COORD_PRECISION = 5;

export interface ReverseGeocodeResult {
  /** Tipo de vía + nombre (p. ej. "Calle Ejemplo"). Null si Google no lo trae. */
  street: string | null;
  /** Solo el número (street_number). Null si Google no lo trae. */
  streetNumber: string | null;
  postalCode: string | null;
  /** Locality (municipio). */
  locality: string | null;
  /** Provincia / administrative_area_level_2. */
  province: string | null;
  /** Dirección formateada por Google (útil para mostrar al usuario). */
  formattedAddress: string | null;
  /** Lat/lng usados como entrada (para invalidar cache si cambian). */
  inputLat: number;
  inputLng: number;
  /** Proveedor usado. */
  source: "google";
  /** Fecha en ISO de cuando se obtuvo (de la cache o fresco). */
  fetchedAt: string;
}

type CachedPayload = ReverseGeocodeResult;

function cacheKey(listingId: string): string {
  return `${CACHE_KEY_PREFIX}${listingId}`;
}

function roundCoord(value: number): number {
  return Number(value.toFixed(COORD_PRECISION));
}

function getApiKey(): string | null {
  const serverKey = process.env.GOOGLE_MAPS_API_KEY;
  if (serverKey && serverKey.trim()) return serverKey.trim();
  const publicKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  if (publicKey && publicKey.trim()) return publicKey.trim();
  return null;
}

interface GoogleAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface GoogleGeocodeResult {
  address_components?: GoogleAddressComponent[];
  formatted_address?: string;
}

interface GoogleGeocodeResponse {
  status: string;
  results?: GoogleGeocodeResult[];
  error_message?: string;
}

function pickComponent(
  components: GoogleAddressComponent[] | undefined,
  type: string,
): GoogleAddressComponent | null {
  if (!Array.isArray(components)) return null;
  return components.find((c) => c.types.includes(type)) ?? null;
}

function buildResult(
  raw: GoogleGeocodeResponse,
  lat: number,
  lng: number,
): ReverseGeocodeResult {
  const first = raw.results?.[0];
  const comps = first?.address_components;

  const streetNumber = pickComponent(comps, "street_number")?.long_name ?? null;
  const route = pickComponent(comps, "route")?.long_name ?? null;
  const postalCode = pickComponent(comps, "postal_code")?.long_name ?? null;
  const locality =
    pickComponent(comps, "locality")?.long_name ??
    pickComponent(comps, "postal_town")?.long_name ??
    null;
  const province =
    pickComponent(comps, "administrative_area_level_2")?.long_name ??
    pickComponent(comps, "administrative_area_level_1")?.long_name ??
    null;

  return {
    street: route,
    streetNumber,
    postalCode,
    locality,
    province,
    formattedAddress: first?.formatted_address ?? null,
    inputLat: roundCoord(lat),
    inputLng: roundCoord(lng),
    source: "google",
    fetchedAt: new Date().toISOString(),
  };
}

async function callGoogleGeocoding(
  lat: number,
  lng: number,
  apiKey: string,
): Promise<ReverseGeocodeResult> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${lat},${lng}`);
  url.searchParams.set("language", "es");
  url.searchParams.set("region", "es");
  url.searchParams.set(
    "result_type",
    "street_address|premise|subpremise|route",
  );
  url.searchParams.set("key", apiKey);

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`google_geocoding_http_${response.status}`);
  }
  const body = (await response.json()) as GoogleGeocodeResponse;

  if (body.status === "OK") return buildResult(body, lat, lng);

  if (body.status === "ZERO_RESULTS") {
    return {
      street: null,
      streetNumber: null,
      postalCode: null,
      locality: null,
      province: null,
      formattedAddress: null,
      inputLat: roundCoord(lat),
      inputLng: roundCoord(lng),
      source: "google",
      fetchedAt: new Date().toISOString(),
    };
  }

  const detail = body.error_message ? `: ${body.error_message}` : "";
  throw new Error(`google_geocoding_status_${body.status}${detail}`);
}

async function readFromCache(
  listingId: string,
  lat: number,
  lng: number,
): Promise<ReverseGeocodeResult | null> {
  const row = await prisma.kvStore.findUnique({
    where: { key: cacheKey(listingId) },
    select: { value: true },
  });
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value) as CachedPayload;
    if (
      parsed.inputLat !== roundCoord(lat) ||
      parsed.inputLng !== roundCoord(lng)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeToCache(
  listingId: string,
  payload: ReverseGeocodeResult,
): Promise<void> {
  const key = cacheKey(listingId);
  const value = JSON.stringify(payload);
  await prisma.kvStore.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

/**
 * Resuelve la dirección postal para un listing dado. Devuelve null si:
 *  - El listing no tiene lat/lng.
 *  - No hay API key configurada (GOOGLE_MAPS_API_KEY ni NEXT_PUBLIC_GOOGLE_MAPS_KEY).
 *  - Google responde ZERO_RESULTS (en ese caso devuelve el resultado vacío
 *    igualmente, no null, para que el front no reintente cada vez).
 */
export async function reverseGeocodeListing(
  listingId: string,
  lat: number | null | undefined,
  lng: number | null | undefined,
  { force = false }: { force?: boolean } = {},
): Promise<ReverseGeocodeResult | null> {
  if (lat == null || lng == null) return null;

  if (!force) {
    const cached = await readFromCache(listingId, lat, lng);
    if (cached) return cached;
  }

  const apiKey = getApiKey();
  if (!apiKey) return null;

  const fresh = await callGoogleGeocoding(lat, lng, apiKey);
  await writeToCache(listingId, fresh);
  return fresh;
}
