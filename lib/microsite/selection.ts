import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { MICROSITE_VALIDATION_SLA_MS, MIN_PREFERRED_PROPERTIES } from "@/lib/microsite/constants";
import { resolveBuyerPhoneForDemand } from "@/lib/microsite/buyer-phone";
import {
  searchSnapshotForDemand,
  type DemandFilterInput,
  type SnapshotMatchedProperty,
} from "@/lib/statefox";
import type { StatefoxSnapshotProperty, StatefoxPropertyZone } from "@/lib/statefox";

export type MicrositeCuratedProperty = {
  propertyId: string;
  title: string;
  description: string | null;
  link: string | null;
  price: number | null;
  pricePerMeter: number | null;
  metersBuilt: number | null;
  metersUsable: number | null;
  metersPlot: number | null;
  metersTerrace: number | null;
  rooms: number | null;
  baths: number | null;
  floor: string | null;
  orientation: string | null;
  address: string | null;
  city: string | null;
  zone: string | null;
  housing: string | null;
  latitude: number | null;
  longitude: number | null;
  images: string[];
  extras: string[];
  energyCertRating: string | null;
  energyCertValue: string | null;
  yearBuilt: string | null;
  condition: string | null;
  advertiserType: "private" | "professional" | null;
  advertiserName: string | null;
};

export type GenerateMicrositeSelectionInput = {
  demandId: string;
  demandNombre: string;
  comercialId: string;
  demand: DemandFilterInput;
  sourceEventId?: string;
};

export type GenerateMicrositeSelectionResult =
  | { ok: true; token: string; selectionId: string; propertiesCount: number; stockCount: number }
  | { ok: false; reason: "STATEFOX_TOKEN_MISSING" | "STATEFOX_ERROR" | "NO_MATCHING_PROPERTIES" };

function generateToken(): string {
  // URL-safe, longitud fija, sin caracteres especiales
  return randomBytes(16).toString("hex");
}

function resolveZoneName(pZone: string | StatefoxPropertyZone | undefined): string {
  if (!pZone) return "";
  if (typeof pZone === "string") return pZone;
  return pZone.name ?? "";
}

function extractImages(p: StatefoxSnapshotProperty): string[] {
  const imgs = p.pImages;
  if (!Array.isArray(imgs)) return [];
  return imgs
    .filter((src): src is string => typeof src === "string" && src.trim() !== "")
    .slice(0, 30);
}

function extractExtras(p: StatefoxSnapshotProperty): string[] {
  const extras = p.pExtras ?? {};
  const labels: string[] = [];

  const push = (condition: boolean, label: string) => {
    if (condition) labels.push(label);
  };

  push(extras.terrace === true, "Terraza");
  push(extras.balcony === true, "Balcón");
  push(extras.lift === true, "Ascensor");
  push(extras.boxroom === true, "Trastero");
  push(extras.exterior === true, "Exterior");
  push(extras.aircond === true || extras.airConditioning === true, "Aire acondicionado");
  push(extras.wardrobes === true, "Armarios empotrados");

  if (typeof extras.heating === "string" && extras.heating.trim()) {
    labels.push(`Calefacción: ${extras.heating.trim()}`);
  }

  return Array.from(new Set(labels));
}

function extractEnergyCert(p: StatefoxSnapshotProperty): { rating: string | null; value: string | null } {
  const extras = p.pExtras ?? {};
  const rating =
    typeof extras.certenerat === "string" && extras.certenerat.trim()
      ? extras.certenerat.trim()
      : null;
  const value =
    extras.certeneval != null ? String(extras.certeneval) : null;
  return { rating, value };
}

function makeTitle(p: StatefoxSnapshotProperty): string {
  const housing = typeof p.pHousing === "string" ? p.pHousing : "";
  const zone = resolveZoneName(p.pZone);
  const city = typeof p.pCity?.cityName === "string" ? p.pCity.cityName : "";

  const parts = [housing, zone, city].map((x) => x.trim()).filter(Boolean);
  if (parts.length) return parts.join(" · ");

  return typeof p.pAddress === "string" && p.pAddress.trim() ? p.pAddress.trim() : "Propiedad";
}

function computePricePerMeter(p: StatefoxSnapshotProperty): number | null {
  const price = p.pPrice ?? 0;
  const meters = p.pMeters?.built ?? 0;
  if (price <= 0 || meters <= 0) return null;
  return Math.round(price / meters);
}

function curate(propertyId: string, p: StatefoxSnapshotProperty): MicrositeCuratedProperty {
  const energy = extractEnergyCert(p);
  const meters = p.pMeters ?? {};
  const point = p.pPoint ?? {};
  const zone = resolveZoneName(p.pZone);

  return {
    propertyId,
    title: makeTitle(p),
    description: typeof p.pDescription === "string" && p.pDescription.trim() ? p.pDescription.trim() : null,
    link: typeof p.pLink === "string" ? p.pLink : null,
    price: typeof p.pPrice === "number" ? p.pPrice : null,
    pricePerMeter: computePricePerMeter(p),
    metersBuilt: typeof meters.built === "number" ? meters.built : null,
    metersUsable: typeof meters.usable === "number" ? meters.usable : null,
    metersPlot: typeof meters.plot === "number" ? meters.plot : null,
    metersTerrace: typeof meters.terrace === "number" ? meters.terrace : null,
    rooms: typeof p.pRooms === "number" ? p.pRooms : null,
    baths: typeof p.pBaths === "number" ? p.pBaths : null,
    floor: typeof p.pFloor === "string" && p.pFloor.trim() ? p.pFloor.trim() : null,
    orientation: typeof p.pOrientation === "string" && p.pOrientation.trim() ? p.pOrientation.trim() : null,
    address: typeof p.pAddress === "string" ? p.pAddress : null,
    city: typeof p.pCity?.cityName === "string" ? p.pCity.cityName : null,
    zone: zone.trim() || null,
    housing: typeof p.pHousing === "string" ? p.pHousing : null,
    latitude: typeof point.latitude === "number" ? point.latitude : null,
    longitude: typeof point.longitude === "number" ? point.longitude : null,
    images: extractImages(p),
    extras: extractExtras(p),
    energyCertRating: energy.rating,
    energyCertValue: energy.value,
    yearBuilt: typeof p.pExtras?.year === "string" && p.pExtras.year.trim() ? p.pExtras.year.trim() : null,
    condition: typeof p.pExtras?.condition === "string" && p.pExtras.condition.trim() ? p.pExtras.condition.trim() : null,
    advertiserType:
      p.pAdvert?.type === "private" || p.pAdvert?.type === "professional"
        ? p.pAdvert.type
        : null,
    advertiserName:
      typeof p.pAdvert?.name === "string" && p.pAdvert.name.trim()
        ? p.pAdvert.name.trim()
        : null,
  };
}

function coerceNullableString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function coerceNullableNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function coerceMicrositeCuratedProperties(value: unknown): MicrositeCuratedProperty[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): MicrositeCuratedProperty | null => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;

      const propertyId = typeof o.propertyId === "string" ? o.propertyId : null;
      const title = typeof o.title === "string" ? o.title : null;
      if (!propertyId || !title) return null;

      return {
        propertyId,
        title,
        description: coerceNullableString(o.description),
        link: coerceNullableString(o.link),
        price: coerceNullableNumber(o.price),
        pricePerMeter: coerceNullableNumber(o.pricePerMeter),
        metersBuilt: coerceNullableNumber(o.metersBuilt),
        metersUsable: coerceNullableNumber(o.metersUsable),
        metersPlot: coerceNullableNumber(o.metersPlot),
        metersTerrace: coerceNullableNumber(o.metersTerrace),
        rooms: coerceNullableNumber(o.rooms),
        baths: coerceNullableNumber(o.baths),
        floor: coerceNullableString(o.floor),
        orientation: coerceNullableString(o.orientation),
        address: coerceNullableString(o.address),
        city: coerceNullableString(o.city),
        zone: coerceNullableString(o.zone),
        housing: coerceNullableString(o.housing),
        latitude: coerceNullableNumber(o.latitude),
        longitude: coerceNullableNumber(o.longitude),
        images: Array.isArray(o.images)
          ? (o.images.filter((x) => typeof x === "string") as string[]).slice(0, 30)
          : [],
        extras: Array.isArray(o.extras)
          ? (o.extras.filter((x) => typeof x === "string") as string[])
          : [],
        energyCertRating: coerceNullableString(o.energyCertRating),
        energyCertValue: coerceNullableString(o.energyCertValue),
        yearBuilt: coerceNullableString(o.yearBuilt),
        condition: coerceNullableString(o.condition),
        advertiserType:
          o.advertiserType === "private" || o.advertiserType === "professional"
            ? o.advertiserType
            : null,
        advertiserName: coerceNullableString(o.advertiserName),
      };
    })
    .filter((x): x is MicrositeCuratedProperty => Boolean(x));
}

export type DescriptionUpdateInput = { propertyId: string; description: string | null };

/**
 * Aplica ediciones de descripción sobre el JSON `properties` de MicrositeSelection.
 * No muta el argumento; devuelve la lista coaccionada actualizada o un error si falta un propertyId.
 */
export function applyDescriptionUpdates(
  properties: unknown,
  updates: DescriptionUpdateInput[],
):
  | { ok: true; properties: MicrositeCuratedProperty[] }
  | { ok: false; error: string } {
  if (updates.length === 0) {
    return { ok: false, error: "updates vacío" };
  }

  const list = coerceMicrositeCuratedProperties(properties);
  if (list.length === 0) {
    return { ok: false, error: "Propiedades no válidas o vacías" };
  }

  const byId = new Map(list.map((p) => [p.propertyId, { ...p }]));

  for (const u of updates) {
    const existing = byId.get(u.propertyId);
    if (!existing) {
      return { ok: false, error: `propertyId desconocido: ${u.propertyId}` };
    }
    const desc =
      u.description === null
        ? null
        : u.description.trim() === ""
          ? null
          : u.description.trim();
    byId.set(u.propertyId, { ...existing, description: desc });
  }

  const next = list.map((p) => byId.get(p.propertyId)!);
  return { ok: true, properties: next };
}

function scoreForDemand(p: StatefoxSnapshotProperty, demand: DemandFilterInput): number {
  let score = 0;

  const price = typeof p.pPrice === "number" ? p.pPrice : null;
  const rooms = typeof p.pRooms === "number" ? p.pRooms : null;

  const imagesCount = extractImages(p).length;
  if (imagesCount > 0) score += 100 + Math.min(imagesCount, 6) * 5;

  if (rooms !== null && rooms >= Math.max(0, demand.habitacionesMin ?? 0)) {
    score += 20;
  }

  if (price !== null) {
    const min = demand.presupuestoMin ?? 0;
    const max = demand.presupuestoMax ?? 0;

    if (min > 0 && max > 0 && max >= min) {
      const target = (min + max) / 2;
      const rel = Math.abs(price - target) / Math.max(1, target);
      score += Math.max(0, 60 - rel * 120);
    } else if (max > 0) {
      const rel = Math.abs(price - max) / Math.max(1, max);
      score += Math.max(0, 50 - rel * 100);
    } else if (min > 0) {
      const rel = Math.abs(price - min) / Math.max(1, min);
      score += Math.max(0, 40 - rel * 80);
    }
  }

  if (p.pAdvert?.type === "professional") score += 5;

  return score;
}

export async function generateMicrositeSelection(
  input: GenerateMicrositeSelectionInput,
): Promise<GenerateMicrositeSelectionResult> {
  if (input.sourceEventId) {
    const existing = await prisma.micrositeSelection.findFirst({
      where: { sourceEventId: input.sourceEventId },
      select: { id: true, token: true, properties: true },
    });
    if (existing) {
      const props = Array.isArray(existing.properties) ? existing.properties : [];
      return {
        ok: true,
        token: existing.token,
        selectionId: existing.id,
        propertiesCount: props.length,
        stockCount: props.length,
      };
    }
  }

  const PRICE_EXPANSION_FACTOR = 0.2;
  const searchOpts = { listingType: "sale" as const, maxPages: 10, targetResults: 30 };

  const expansionSteps: Array<{ label: string; demand: DemandFilterInput }> = [
    { label: "exact", demand: input.demand },
    {
      label: "price+20%",
      demand: {
        ...input.demand,
        presupuestoMin: Math.round((input.demand.presupuestoMin ?? 0) * (1 - PRICE_EXPANSION_FACTOR)),
        presupuestoMax: Math.round((input.demand.presupuestoMax ?? 0) * (1 + PRICE_EXPANSION_FACTOR)),
      },
    },
    {
      label: "price+20%,no-zone",
      demand: {
        ...input.demand,
        presupuestoMin: Math.round((input.demand.presupuestoMin ?? 0) * (1 - PRICE_EXPANSION_FACTOR)),
        presupuestoMax: Math.round((input.demand.presupuestoMax ?? 0) * (1 + PRICE_EXPANSION_FACTOR)),
        zonas: "",
      },
    },
  ];

  const seen = new Set<string>();
  let allRanked: Array<{ propertyId: string; property: StatefoxSnapshotProperty; score: number }> = [];
  let totalStock = 0;
  let lastSearchMeta = { pagesScanned: 0, totalScanned: 0, earlyExit: false };

  for (const step of expansionSteps) {
    let searchResult;
    try {
      searchResult = await searchSnapshotForDemand(step.demand, searchOpts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("requires token")) {
        return { ok: false, reason: "STATEFOX_TOKEN_MISSING" };
      }
      console.error(`[microsite:selection] Error en snapshot search (${step.label}): ${msg}`);
      return { ok: false, reason: "STATEFOX_ERROR" };
    }

    lastSearchMeta = {
      pagesScanned: searchResult.pagesScanned,
      totalScanned: searchResult.totalScanned,
      earlyExit: searchResult.earlyExit,
    };
    totalStock = Math.max(totalStock, searchResult.properties.length);

    for (const m of searchResult.properties) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      allRanked.push({
        propertyId: m.id,
        property: m.property,
        score: scoreForDemand(m.property, input.demand),
      });
    }

    const withImages = allRanked.filter((x) => extractImages(x.property).length > 0);
    if (withImages.length >= MIN_PREFERRED_PROPERTIES) {
      if (step.label !== "exact") {
        console.log(
          `[microsite:selection] Búsqueda ampliada (${step.label}) alcanzó ${withImages.length} propiedades con imágenes`,
        );
      }
      break;
    }

    console.log(
      `[microsite:selection] Paso ${step.label}: ${withImages.length} con imágenes (< ${MIN_PREFERRED_PROPERTIES}), ampliando...`,
    );
  }

  const rankedWithImages = allRanked
    .filter((x) => extractImages(x.property).length > 0)
    .sort((a, b) => b.score - a.score);

  if (rankedWithImages.length === 0) {
    return { ok: false, reason: "NO_MATCHING_PROPERTIES" };
  }

  const curated = rankedWithImages.slice(0, 12).map((x) => curate(x.propertyId, x.property));

  const token = generateToken();
  const validationToken = generateToken();
  const buyerPhone = await resolveBuyerPhoneForDemand(input.demandId);
  const validationDueAt = new Date(Date.now() + MICROSITE_VALIDATION_SLA_MS);

  const searchMeta = {
    endpoint: "snapshot" as const,
    pagesScanned: lastSearchMeta.pagesScanned,
    totalScanned: lastSearchMeta.totalScanned,
    earlyExit: lastSearchMeta.earlyExit,
  };

  const created = await prisma.micrositeSelection.create({
    data: {
      token,
      validationToken,
      demandId: input.demandId,
      demandNombre: input.demandNombre,
      comercialId: input.comercialId,
      buyerPhone,
      statefoxQuery: searchMeta as unknown as object,
      resultFilters: {} as unknown as object,
      properties: curated as unknown as object,
      stockCount: totalStock,
      sourceEventId: input.sourceEventId,
      validationDueAt,
    },
    select: { id: true },
  });

  return {
    ok: true,
    token,
    selectionId: created.id,
    propertiesCount: curated.length,
    stockCount: totalStock,
  };
}

