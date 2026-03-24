import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { MICROSITE_VALIDATION_SLA_MS } from "@/lib/microsite/constants";
import { resolveBuyerPhoneForDemand } from "@/lib/microsite/buyer-phone";
import {
  buildStatefoxQuery,
  createStatefoxClient,
  filterStatefoxResults,
  getProperties,
  type DemandFilterInput,
  type StatefoxProperty,
} from "@/lib/statefox";

export type MicrositeCuratedProperty = {
  propertyId: string;
  title: string;
  link: string | null;
  price: number | null;
  metersBuilt: number | null;
  rooms: number | null;
  baths: number | null;
  address: string | null;
  city: string | null;
  zone: string | null;
  housing: string | null;
  images: string[];
  extras: string[];
  advertiserType: "private" | "professional" | null;
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

function extractImages(p: StatefoxProperty): string[] {
  const urls: string[] = [];

  if (p.propertyMainImage && typeof p.propertyMainImage === "string") {
    urls.push(p.propertyMainImage);
  }

  const imgs = p.pImages;
  if (imgs && typeof imgs === "object") {
    for (const item of Object.values(imgs)) {
      const src = item?.src;
      if (src && typeof src === "string") urls.push(src);
    }
  }

  // dedupe + cap
  return Array.from(new Set(urls)).slice(0, 12);
}

function extractExtras(p: StatefoxProperty): string[] {
  const extras = p.pExtras ?? {};
  const labels: string[] = [];

  const push = (condition: boolean, label: string) => {
    if (condition) labels.push(label);
  };

  push(extras.terrace === true, "Terraza");
  push(extras.balcony === true, "Balcón");
  push(extras.lift === true, "Ascensor");
  push(extras.pool === true, "Piscina");
  push(extras.garden === true, "Jardín");
  push(extras.garage === true, "Garaje");
  push(extras.boxroom === true, "Trastero");
  push(extras.exterior === true, "Exterior");
  push(extras.aircond === true || extras.airConditioning === true, "Aire acondicionado");
  push(extras.wardrobes === true, "Armarios empotrados");
  push(extras.furniture === true || extras.furnished === true, "Amueblado");

  if (typeof extras.heating === "string" && extras.heating.trim()) {
    labels.push(`Calefacción: ${extras.heating.trim()}`);
  }
  if (typeof extras.condition === "string" && extras.condition.trim()) {
    labels.push(`Estado: ${extras.condition.trim()}`);
  }

  return Array.from(new Set(labels)).slice(0, 8);
}

function makeTitle(p: StatefoxProperty): string {
  const housing = typeof p.pHousing === "string" ? p.pHousing : "";
  const zone = typeof p.pZone?.name === "string" ? p.pZone.name : "";
  const city = typeof p.pCity?.cityName === "string" ? p.pCity.cityName : "";

  const parts = [housing, zone, city].map((x) => x.trim()).filter(Boolean);
  if (parts.length) return parts.join(" · ");

  return typeof p.pAddress === "string" && p.pAddress.trim() ? p.pAddress.trim() : "Propiedad";
}

function curate(propertyId: string, p: StatefoxProperty): MicrositeCuratedProperty {
  return {
    propertyId,
    title: makeTitle(p),
    link: typeof p.pLink === "string" ? p.pLink : null,
    price: typeof p.pPrice === "number" ? p.pPrice : null,
    metersBuilt: typeof p.pMeters?.built === "number" ? p.pMeters.built : null,
    rooms: typeof p.pRooms === "number" ? p.pRooms : null,
    baths: typeof p.pBaths === "number" ? p.pBaths : null,
    address: typeof p.pAddress === "string" ? p.pAddress : null,
    city: typeof p.pCity?.cityName === "string" ? p.pCity.cityName : null,
    zone: typeof p.pZone?.name === "string" ? p.pZone.name : null,
    housing: typeof p.pHousing === "string" ? p.pHousing : null,
    images: extractImages(p),
    extras: extractExtras(p),
    advertiserType:
      p.pAdvert?.type === "private" || p.pAdvert?.type === "professional"
        ? p.pAdvert.type
        : null,
  };
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
        link: typeof o.link === "string" ? o.link : null,
        price: typeof o.price === "number" ? o.price : null,
        metersBuilt: typeof o.metersBuilt === "number" ? o.metersBuilt : null,
        rooms: typeof o.rooms === "number" ? o.rooms : null,
        baths: typeof o.baths === "number" ? o.baths : null,
        address: typeof o.address === "string" ? o.address : null,
        city: typeof o.city === "string" ? o.city : null,
        zone: typeof o.zone === "string" ? o.zone : null,
        housing: typeof o.housing === "string" ? o.housing : null,
        images: Array.isArray(o.images)
          ? (o.images.filter((x) => typeof x === "string") as string[]).slice(0, 12)
          : [],
        extras: Array.isArray(o.extras)
          ? (o.extras.filter((x) => typeof x === "string") as string[]).slice(0, 8)
          : [],
        advertiserType:
          o.advertiserType === "private" || o.advertiserType === "professional"
            ? o.advertiserType
            : null,
      };
    })
    .filter((x): x is MicrositeCuratedProperty => Boolean(x));
}

function scoreForDemand(p: StatefoxProperty, demand: DemandFilterInput): number {
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
      // si solo hay min, preferimos no quedarnos por debajo por demasiado (pero no excluimos)
      const rel = Math.abs(price - min) / Math.max(1, min);
      score += Math.max(0, 40 - rel * 80);
    }
  }

  // Preferir anuncios profesionales ligeramente (suelen tener mejor info)
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

  let client;
  try {
    client = createStatefoxClient();
  } catch {
    return { ok: false, reason: "STATEFOX_TOKEN_MISSING" };
  }

  const { queryParams, resultFilters } = buildStatefoxQuery(input.demand, {
    type: "sale",
    source: "idealista",
    items: 100,
  });

  let response;
  try {
    response = await getProperties(client, {
      source: queryParams.source,
      type: queryParams.type,
      items: queryParams.items,
      housing: queryParams.housing,
    });
  } catch {
    return { ok: false, reason: "STATEFOX_ERROR" };
  }

  const all = Object.entries(response.properties).map(([propertyId, p]) => ({
    propertyId,
    property: p,
  }));

  const matching = filterStatefoxResults(
    all.map((x) => x.property),
    resultFilters,
  );

  const matchingIds = new Set(
    Object.entries(response.properties)
      .filter(([, p]) => matching.includes(p))
      .map(([id]) => id),
  );

  const minRooms = Math.max(0, input.demand.habitacionesMin ?? 0);
  const filtered = all
    .filter((x) => matchingIds.has(x.propertyId))
    .filter((x) => {
      const rooms = typeof x.property.pRooms === "number" ? x.property.pRooms : null;
      if (minRooms <= 0) return true;
      return rooms !== null ? rooms >= minRooms : true;
    });

  if (filtered.length === 0) {
    return { ok: false, reason: "NO_MATCHING_PROPERTIES" };
  }

  const ranked = filtered
    .map((x) => ({
      propertyId: x.propertyId,
      property: x.property,
      score: scoreForDemand(x.property, input.demand),
    }))
    .sort((a, b) => b.score - a.score);

  const curated = ranked.slice(0, 12).map((x) => curate(x.propertyId, x.property));

  const token = generateToken();
  const validationToken = generateToken();
  const buyerPhone = await resolveBuyerPhoneForDemand(input.demandId);
  const validationDueAt = new Date(Date.now() + MICROSITE_VALIDATION_SLA_MS);

  const created = await prisma.micrositeSelection.create({
    data: {
      token,
      validationToken,
      demandId: input.demandId,
      demandNombre: input.demandNombre,
      comercialId: input.comercialId,
      buyerPhone,
      statefoxQuery: queryParams as unknown as object,
      resultFilters: resultFilters as unknown as object,
      properties: curated as unknown as object,
      stockCount: filtered.length,
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
    stockCount: filtered.length,
  };
}

