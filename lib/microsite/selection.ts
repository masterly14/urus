import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";
import { MIN_PREFERRED_PROPERTIES } from "@/lib/microsite/constants";
import { resolveBuyerPhoneForDemand } from "@/lib/microsite/buyer-phone";
import { formatStatefoxHousingLabel } from "@/lib/statefox/housing-label";
import {
  searchSnapshotForDemand,
  type DemandFilterInput,
} from "@/lib/statefox";
import type { StatefoxSnapshotProperty, StatefoxPropertyZone } from "@/lib/statefox";
import { isExpiredStatefoxImageUrl } from "@/lib/statefox/image-expiry";
import {
  EXTERNAL_PORTFOLIO_DISABLED_REASON,
  isExternalPortfolioSearchEnabled,
} from "@/lib/statefox/external-search";
import {
  enqueueStatefoxImageImportsForComparables,
  getImportedImagesByStatefoxIds,
  toCloudinaryUrls,
  warmImportStatefoxImagesOnFirstSeen,
  type CachedStatefoxImage,
} from "@/lib/statefox/image-cache";
import { buildCandidateExpansionSteps } from "@/lib/matching/candidate-expansion";
import { buildDemandLocationContext } from "@/lib/matching/location-context";
import { evaluateLocationMatch } from "@/lib/matching/location";
import {
  MIN_PREFERRED_RANKER_PROPERTIES,
  rankPropertiesWithAI,
  type AIRankerCandidate,
  type AIRankerFeedbackContext,
  type AIRankerResult,
} from "@/lib/matching/ai-ranker";
import type { DemandForMatching, LocationMatchContext, PropertyForMatching } from "@/lib/matching";

export type MicrositeCuratedProperty = {
  propertyId: string;
  title: string;
  description: string | null;
  contactPhones: string[];
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
  aiRank?: number;
  aiReason?: string;
  aiRisks?: string[];
  geoFit?: AIRankerCandidate["geoFit"];
  deterministicScore?: number;
};

export type GenerateMicrositeSelectionInput = {
  demandId: string;
  demandNombre: string;
  comercialId: string;
  demand: DemandFilterInput;
  sourceEventId?: string;
  source?: string;
  selectionFeedbackContext?: AIRankerFeedbackContext;
};

export type GenerateMicrositeSelectionResult =
  | { ok: true; token: string; selectionId: string; propertiesCount: number; stockCount: number }
  | {
    ok: false;
    reason:
      | "STATEFOX_TOKEN_MISSING"
      | "STATEFOX_ERROR"
      | "NO_MATCHING_PROPERTIES"
      | "EXTERNAL_SEARCH_DISABLED";
  };

function generateToken(): string {
  return randomBytes(16).toString("hex");
}

function resolveZoneName(pZone: string | StatefoxPropertyZone | undefined): string {
  if (!pZone) return "";
  if (typeof pZone === "string") return pZone;
  return pZone.name ?? "";
}

function extractImages(p: StatefoxSnapshotProperty): string[] {
  const imgs = p.pImages;
  return Array.isArray(imgs)
    ? imgs
        .filter(
          (src): src is string =>
            typeof src === "string" && src.trim() !== "" && !isExpiredStatefoxImageUrl(src),
        )
        .slice(0, 30)
    : [];
}

function extractPhones(p: StatefoxSnapshotProperty): string[] {
  if (!Array.isArray(p.pPhones)) return [];
  return p.pPhones
    .filter((phone): phone is string => typeof phone === "string")
    .map((phone) => phone.trim())
    .filter((phone) => phone.length > 0)
    .slice(0, 10);
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
  const housing = formatStatefoxHousingLabel(
    typeof p.pHousing === "string" ? p.pHousing : null,
  );
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
    contactPhones: extractPhones(p),
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
        contactPhones: Array.isArray(o.contactPhones)
          ? (o.contactPhones.filter((x) => typeof x === "string") as string[]).map((x) => x.trim()).filter(Boolean).slice(0, 10)
          : [],
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
        aiRank: coerceNullableNumber(o.aiRank) ?? undefined,
        aiReason: coerceNullableString(o.aiReason) ?? undefined,
        aiRisks: Array.isArray(o.aiRisks)
          ? (o.aiRisks.filter((x) => typeof x === "string") as string[])
          : undefined,
        geoFit:
          o.geoFit === "exact" ||
          o.geoFit === "nearby" ||
          o.geoFit === "same_city" ||
          o.geoFit === "unknown"
            ? o.geoFit
            : undefined,
        deterministicScore: coerceNullableNumber(o.deterministicScore) ?? undefined,
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

async function replaceMicrositeImagesWithCloudinaryCache(
  curated: MicrositeCuratedProperty[],
): Promise<void> {
  if (curated.length === 0) return;
  const ids = curated.map((c) => c.propertyId);

  let cached: Map<string, CachedStatefoxImage[]>;
  try {
    cached = await getImportedImagesByStatefoxIds(ids);
  } catch (err) {
    console.warn(
      `[microsite:selection] No se pudo consultar cache Cloudinary: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    cached = new Map();
  }

  const missing = curated
    .filter((c) => !cached.has(c.propertyId) && Boolean(c.link))
    .map((c) => ({ statefoxId: c.propertyId, portalUrl: c.link as string }));

  if (missing.length > 0) {
    const warm = await warmImportStatefoxImagesOnFirstSeen(missing);
    if (warm.imported > 0) {
      try {
        cached = await getImportedImagesByStatefoxIds(ids);
      } catch (err) {
        console.warn(
          `[microsite:selection] No se pudo refrescar cache tras warm import: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      console.log(
        `[microsite:selection] Warm import en caliente: ${warm.imported}/${warm.attempted} comparables con foto inmediata`,
      );
    }

    await enqueueStatefoxImageImportsForComparables(missing);
  }

  for (const property of curated) {
    const cachedUrls = toCloudinaryUrls(cached.get(property.propertyId) ?? []);
    if (cachedUrls.length > 0) {
      property.images = cachedUrls;
    }
  }
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

function toDemandForMatching(demandId: string, demand: DemandFilterInput): DemandForMatching {
  return {
    codigo: demandId,
    ref: demandId,
    nombre: "",
    presupuestoMin: demand.presupuestoMin,
    presupuestoMax: demand.presupuestoMax,
    habitacionesMin: demand.habitacionesMin,
    tipos: demand.tipos,
    zonas: demand.zonas,
    metrosMin: demand.metrosMin,
    metrosMax: demand.metrosMax,
    tipoOperacion: "venta",
  };
}

function toPropertyForMatching(propertyId: string, p: StatefoxSnapshotProperty): PropertyForMatching {
  return {
    codigo: propertyId,
    ref: propertyId,
    titulo: makeTitle(p),
    tipoOfer: typeof p.pHousing === "string" ? p.pHousing : "",
    precio: typeof p.pPrice === "number" ? p.pPrice : 0,
    metrosConstruidos: typeof p.pMeters?.built === "number" ? p.pMeters.built : 0,
    habitaciones: typeof p.pRooms === "number" ? p.pRooms : 0,
    ciudad: typeof p.pCity?.cityName === "string" ? p.pCity.cityName : "",
    zona: resolveZoneName(p.pZone),
    tipoOperacion: "venta",
  };
}

function inferGeoFit(
  propertyId: string,
  property: StatefoxSnapshotProperty,
  demand: DemandForMatching,
  location: LocationMatchContext,
): AIRankerCandidate["geoFit"] | null {
  const decision = evaluateLocationMatch(
    toPropertyForMatching(propertyId, property),
    demand,
    location,
  );
  if (!decision.matched) return null;
  if (decision.matchedBy === "exact_zone") return "exact";
  if (decision.matchedBy === "nearby_zone") return "nearby";
  return decision.matchedBy === "city" ? "same_city" : "unknown";
}

function toAIRankerCandidate(
  ranked: { propertyId: string; property: StatefoxSnapshotProperty; score: number },
  demandForMatching: DemandForMatching,
  location: LocationMatchContext,
): AIRankerCandidate | null {
  const geoFit = inferGeoFit(ranked.propertyId, ranked.property, demandForMatching, location);
  if (!geoFit) return null;

  return {
    propertyId: ranked.propertyId,
    deterministicScore: ranked.score,
    geoFit,
    title: makeTitle(ranked.property),
    city: typeof ranked.property.pCity?.cityName === "string" ? ranked.property.pCity.cityName : null,
    zone: resolveZoneName(ranked.property.pZone) || null,
    price: typeof ranked.property.pPrice === "number" ? ranked.property.pPrice : null,
    rooms: typeof ranked.property.pRooms === "number" ? ranked.property.pRooms : null,
    metersBuilt:
      typeof ranked.property.pMeters?.built === "number" ? ranked.property.pMeters.built : null,
    imagesCount: extractImages(ranked.property).length,
    advertiserType:
      typeof ranked.property.pAdvert?.type === "string" ? ranked.property.pAdvert.type : null,
  };
}

function applyRankerMetadata(
  property: MicrositeCuratedProperty,
  candidate: AIRankerCandidate | undefined,
  selected: AIRankerResult["selected"][number] | undefined,
): MicrositeCuratedProperty {
  return {
    ...property,
    aiRank: selected?.rank,
    aiReason: selected?.reason,
    aiRisks: selected?.risks,
    geoFit: candidate?.geoFit,
    deterministicScore: candidate?.deterministicScore,
  };
}

export async function generateMicrositeSelection(
  input: GenerateMicrositeSelectionInput,
): Promise<GenerateMicrositeSelectionResult> {
  if (!isExternalPortfolioSearchEnabled()) {
    console.warn(`[microsite:selection] ${EXTERNAL_PORTFOLIO_DISABLED_REASON}`);
    return { ok: false, reason: "EXTERNAL_SEARCH_DISABLED" };
  }

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

  const searchOpts = { listingType: "sale" as const, maxPages: 10, targetResults: 30 };
  const locationContext = await buildDemandLocationContext({ zonas: input.demand.zonas });
  const demandForMatching = toDemandForMatching(input.demandId, input.demand);
  const expansionSteps = buildCandidateExpansionSteps(input.demand, locationContext);

  const seen = new Set<string>();
  const allRanked: Array<{ propertyId: string; property: StatefoxSnapshotProperty; score: number }> = [];
  let totalStock = 0;
  let lastSearchMeta = { pagesScanned: 0, totalScanned: 0, earlyExit: false };

  // Source de busqueda: MarketListing (in-house) o Statefox legacy.
  // Si MARKET_PRICING_SOURCE=marketlisting y la primera ejecucion devuelve
  // resultados, se usa esa source; si devuelve 0 (p.ej. ciudad sin seeds),
  // caemos a Statefox para no romper microsites en otras ciudades.
  const useMarketListing =
    (process.env.MARKET_PRICING_SOURCE ?? "statefox").toLowerCase() ===
    "marketlisting";
  const { searchMarketForDemand } = useMarketListing
    ? await import("@/lib/market/search")
    : { searchMarketForDemand: null as never };

  let consumedSteps = 0;

  const runExpansionStep = async (step: (typeof expansionSteps)[number]): Promise<
    | { ok: true }
    | { ok: false; reason: "STATEFOX_TOKEN_MISSING" | "STATEFOX_ERROR" }
  > => {
    let searchResult;
    try {
      if (useMarketListing) {
        const marketResult = await searchMarketForDemand(step.demand, searchOpts);
        if (marketResult.properties.length === 0) {
          // Sin matches en MarketListing → fallback a Statefox para esta busqueda.
          searchResult = await searchSnapshotForDemand(step.demand, searchOpts);
        } else {
          searchResult = marketResult;
        }
      } else {
        searchResult = await searchSnapshotForDemand(step.demand, searchOpts);
      }
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
    console.log(
      `[microsite:selection] Paso ${step.label}: ${withImages.length} con imágenes`,
    );

    return { ok: true };
  };

  const buildRankerCandidates = () =>
    allRanked
      .filter((x) => extractImages(x.property).length > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => toAIRankerCandidate(x, demandForMatching, locationContext))
      .filter((x): x is AIRankerCandidate => Boolean(x));

  while (consumedSteps < expansionSteps.length) {
    const step = expansionSteps[consumedSteps];
    consumedSteps += 1;
    const stepResult = await runExpansionStep(step);
    if (!stepResult.ok) return stepResult;

    const withImages = allRanked.filter((x) => extractImages(x.property).length > 0);
    const rankerEligibleCount = buildRankerCandidates().length;
    if (rankerEligibleCount >= MIN_PREFERRED_PROPERTIES) {
      if (step.label !== "exact") {
        console.log(
          `[microsite:selection] Búsqueda ampliada (${step.label}) alcanzó ${rankerEligibleCount} propiedades geográficamente válidas con imágenes`,
        );
      }
      break;
    }

    console.log(
      `[microsite:selection] Paso ${step.label}: ${withImages.length} con imágenes, ${rankerEligibleCount} válidas para ranking (< ${MIN_PREFERRED_PROPERTIES}), ampliando...`,
    );
  }

  const rankedWithImages = allRanked
    .filter((x) => extractImages(x.property).length > 0)
    .sort((a, b) => b.score - a.score);

  if (rankedWithImages.length === 0) {
    return { ok: false, reason: "NO_MATCHING_PROPERTIES" };
  }

  let rankerCandidates = buildRankerCandidates();
  if (rankerCandidates.length === 0) {
    return { ok: false, reason: "NO_MATCHING_PROPERTIES" };
  }

  let rankerResult = await rankPropertiesWithAI({
    demandId: input.demandId,
    demand: input.demand,
    location: locationContext,
    candidates: rankerCandidates,
    feedback: input.selectionFeedbackContext,
    minPreferredProperties: MIN_PREFERRED_RANKER_PROPERTIES,
  });

  let aiExpansionRounds = 0;
  while (
    rankerResult.needsMoreCandidates &&
    consumedSteps < expansionSteps.length &&
    aiExpansionRounds < 2
  ) {
    const step = expansionSteps[consumedSteps];
    consumedSteps += 1;
    aiExpansionRounds += 1;
    console.log(
      `[microsite:selection] Reranker pidió más candidatos: ${rankerResult.expansionRequest?.reason ?? "sin detalle"}. Ejecutando ${step.label}`,
    );
    const stepResult = await runExpansionStep(step);
    if (!stepResult.ok) return stepResult;
    rankerCandidates = buildRankerCandidates();
    rankerResult = await rankPropertiesWithAI({
      demandId: input.demandId,
      demand: input.demand,
      location: locationContext,
      candidates: rankerCandidates,
      feedback: input.selectionFeedbackContext,
      minPreferredProperties: MIN_PREFERRED_RANKER_PROPERTIES,
    });
  }

  if (rankerResult.selected.length === 0) {
    return { ok: false, reason: "NO_MATCHING_PROPERTIES" };
  }

  const propertyById = new Map(allRanked.map((x) => [x.propertyId, x]));
  const candidateById = new Map(rankerCandidates.map((candidate) => [candidate.propertyId, candidate]));
  const selectedById = new Map(rankerResult.selected.map((selected) => [selected.propertyId, selected]));
  const curated = rankerResult.selected
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 12)
    .map((selected) => {
      const ranked = propertyById.get(selected.propertyId);
      if (!ranked) return null;
      return applyRankerMetadata(
        curate(ranked.propertyId, ranked.property),
        candidateById.get(selected.propertyId),
        selectedById.get(selected.propertyId),
      );
    })
    .filter((property): property is MicrositeCuratedProperty => Boolean(property));

  if (curated.length === 0) {
    return { ok: false, reason: "NO_MATCHING_PROPERTIES" };
  }

  await replaceMicrositeImagesWithCloudinaryCache(curated);

  const token = generateToken();
  const buyerPhone = await resolveBuyerPhoneForDemand(input.demandId);

  const searchMeta = {
    endpoint: "snapshot" as const,
    pagesScanned: lastSearchMeta.pagesScanned,
    totalScanned: lastSearchMeta.totalScanned,
    earlyExit: lastSearchMeta.earlyExit,
    expansionSteps: expansionSteps.slice(0, consumedSteps).map((step) => ({
      label: step.label,
      relaxation: step.relaxation,
    })),
    aiExpansionRounds,
    ranker: {
      model: rankerResult.model,
      durationMs: rankerResult.durationMs,
      fallbackApplied: rankerResult.fallbackApplied,
      fallbackReason: rankerResult.fallbackReason,
      needsMoreCandidates: rankerResult.needsMoreCandidates,
      expansionRequest: rankerResult.expansionRequest ?? null,
    },
  };

  const created = await prisma.micrositeSelection.create({
    data: {
      token,
      demandId: input.demandId,
      demandNombre: input.demandNombre,
      comercialId: input.comercialId,
      buyerPhone,
      statefoxQuery: searchMeta as unknown as object,
      resultFilters: {} as unknown as object,
      properties: curated as unknown as object,
      stockCount: totalStock,
      sourceEventId: input.sourceEventId,
      source: input.source ?? null,
    },
    select: { id: true },
  });

  await appendEvent({
    type: "SELECCION_RANKEADA_IA",
    aggregateType: "DEMAND",
    aggregateId: input.demandId,
    payload: {
      selectionId: created.id,
      demandId: input.demandId,
      model: rankerResult.model,
      durationMs: rankerResult.durationMs,
      fallbackApplied: rankerResult.fallbackApplied,
      fallbackReason: rankerResult.fallbackReason ?? null,
      candidates: rankerCandidates.map((candidate) => ({
        propertyId: candidate.propertyId,
        deterministicScore: candidate.deterministicScore,
        geoFit: candidate.geoFit,
      })),
      selected: rankerResult.selected,
      rejected: rankerResult.rejected,
      needsMoreCandidates: rankerResult.needsMoreCandidates,
      expansionRequest: rankerResult.expansionRequest ?? null,
      expansionSteps: expansionSteps.slice(0, consumedSteps).map((step) => ({
        label: step.label,
        relaxation: step.relaxation,
      })),
      aiExpansionRounds,
    },
    correlationId: input.sourceEventId,
    causationId: input.sourceEventId,
  });

  return {
    ok: true,
    token,
    selectionId: created.id,
    propertiesCount: curated.length,
    stockCount: totalStock,
  };
}

