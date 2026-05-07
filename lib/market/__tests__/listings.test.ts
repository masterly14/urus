import { beforeEach, describe, expect, it, vi } from "vitest";

const { findManyMock, countMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
  countMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    marketListing: {
      findMany: findManyMock,
      count: countMock,
    },
  },
}));

import {
  decodeListingCursor,
  encodeListingCursor,
  listOpportunityListings,
} from "../listings";

interface ListingFactoryInput {
  id?: string;
  source?: string;
  lat?: number | null;
  lng?: number | null;
  city?: string;
  zone?: string | null;
  price?: number | null;
  builtArea?: number | null;
  pricePerMeter?: number | null;
  rooms?: number | null;
  bathrooms?: number | null;
  phones?: string[];
  advertiserType?: string | null;
  advertiser?: {
    id: string;
    displayName: string | null;
    advertiserType: string | null;
    phoneCanonical: string | null;
    inmovillaContactId: string | null;
  } | null;
  assignedComercialId?: string | null;
  assignedComercialNombre?: string | null;
  assignedAt?: Date | null;
  captacionStage?:
    | "NEW"
    | "PROSPECT_CREATING"
    | "PROSPECT_CREATED"
    | "ENCARGO_ATTACHED"
    | "READY_FOR_PROPERTY"
    | "PROPERTY_CREATING"
    | "PROPERTY_CREATED"
    | "FAILED";
  inmovillaProspectRef?: string | null;
  inmovillaPropertyCodOfer?: number | null;
  captacionLastError?: string | null;
  captacionUpdatedAt?: Date;
  lastSeenAt?: Date;
  firstSeenAt?: Date;
}

function makeListing(overrides: ListingFactoryInput = {}): unknown {
  return {
    id: overrides.id ?? "list-1",
    source: overrides.source ?? "source_d",
    operation: "sale",
    housingType: "flat",
    status: "active",
    canonicalUrl: "https://www.idealista.com/inmueble/1/",
    addressApprox: "Calle Real 1",
    city: overrides.city ?? "cordoba",
    zone: overrides.zone ?? "Centro",
    lat: overrides.lat === undefined ? 37.88 : overrides.lat,
    lng: overrides.lng === undefined ? -4.78 : overrides.lng,
    builtArea: overrides.builtArea ?? 90,
    rooms: overrides.rooms ?? 3,
    bathrooms: overrides.bathrooms ?? 2,
    floor: "2",
    price: overrides.price ?? 200000,
    pricePerMeter: overrides.pricePerMeter ?? 2222,
    currency: "EUR",
    mainImageUrl: null,
    imageUrls: [],
    description: null,
    listingReference: null,
    cadastralRef: null,
    detailFetchedAt: null,
    phones: overrides.phones ?? ["+34600111222"],
    advertiserType: overrides.advertiserType ?? "particular",
    advertiserName: "Maria",
    advertiserId: overrides.advertiser?.id ?? "adv-1",
    assignedComercialId: overrides.assignedComercialId ?? null,
    assignedAt: overrides.assignedAt ?? null,
    assignedByUserId: null,
    captacionStage: overrides.captacionStage ?? "NEW",
    inmovillaProspectRef: overrides.inmovillaProspectRef ?? null,
    inmovillaPropertyCodOfer: overrides.inmovillaPropertyCodOfer ?? null,
    captacionLastError: overrides.captacionLastError ?? null,
    captacionUpdatedAt:
      overrides.captacionUpdatedAt ?? new Date("2026-05-06T12:05:00Z"),
    firstSeenAt: overrides.firstSeenAt ?? new Date("2026-05-06T10:00:00Z"),
    lastSeenAt: overrides.lastSeenAt ?? new Date("2026-05-06T12:00:00Z"),
    advertiser:
      overrides.advertiser === null
        ? null
        : overrides.advertiser ?? {
            id: "adv-1",
            displayName: "Maria",
            advertiserType: "particular",
            phoneCanonical: "+34600111222",
            inmovillaContactId: null,
          },
    assignedComercial: overrides.assignedComercialId
      ? {
          id: overrides.assignedComercialId,
          nombre: overrides.assignedComercialNombre ?? "Marina",
        }
      : null,
  };
}

beforeEach(() => {
  findManyMock.mockReset();
  countMock.mockReset();
});

describe("encodeListingCursor / decodeListingCursor", () => {
  it("roundtrips el cursor", () => {
    const c = { lastSeenAt: "2026-05-06T12:00:00.000Z", id: "abc" };
    expect(decodeListingCursor(encodeListingCursor(c))).toEqual(c);
  });

  it("devuelve null en cursor invalido", () => {
    expect(decodeListingCursor("not-base64!!")).toBeNull();
  });
});

describe("listOpportunityListings", () => {
  it("devuelve items sin filtros adicionales (incluye agencias bajo politica nueva)", async () => {
    findManyMock.mockResolvedValue([makeListing()]);
    countMock.mockResolvedValue(1);

    const result = await listOpportunityListings({});

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe("list-1");
    expect(result.items[0]!.phoneCanonical).toBe("+34600111222");
    expect(result.items[0]!.lat).toBe(37.88);
    expect(result.items[0]!.captacionStage).toBe("NEW");
    expect(result.meta.polygonApplied).toBe(false);
    expect(result.meta.totalEstimated).toBe(1);

    // No filtro implicito de advertiserType bajo politica nueva.
    const call = findManyMock.mock.calls[0]![0]!;
    expect(call.where.advertiserType).toBeUndefined();
  });

  it("aplica filtros de city, sources, operation y advertiserType en la where", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);

    await listOpportunityListings({
      city: "cordoba",
      sources: ["source_d", "source_b"],
      operation: "sale",
      advertiserType: "particular",
      hasPhone: true,
      sinceHours: 24,
      priceMin: 100000,
      priceMax: 300000,
      areaMin: 60,
      roomsMin: 2,
    });

    expect(findManyMock).toHaveBeenCalledTimes(1);
    const call = findManyMock.mock.calls[0]![0]!;
    expect(call.where.city).toEqual({
      startsWith: "cordoba",
      mode: "insensitive",
    });
    expect(call.where.source).toEqual({ in: ["source_d", "source_b"] });
    expect(call.where.operation).toBe("sale");
    expect(call.where.advertiserType).toBe("particular");
    expect(call.where.OR).toEqual(
      expect.arrayContaining([
        { advertiser: { phoneCanonical: { not: null } } },
        { phones: { isEmpty: false } },
      ]),
    );
    expect(call.where.lastSeenAt).toEqual({ gte: expect.any(Date) });
    expect(call.where.price).toEqual({ gte: 100000, lte: 300000 });
    expect(call.where.builtArea).toEqual({ gte: 60 });
    expect(call.where.rooms).toEqual({ gte: 2 });
  });

  it("con poligono activa filtro bbox y post-filter point-in-polygon", async () => {
    // Cuadrado pequeño alrededor del centro (lat 37.88, lng -4.78).
    const polygon: Array<[number, number]> = [
      [-4.79, 37.87],
      [-4.77, 37.87],
      [-4.77, 37.89],
      [-4.79, 37.89],
    ];
    // Tres listings: uno dentro, uno fuera del bbox, uno dentro del bbox pero
    // en una "esquina" que no esta en el polygon (este es un cuadrado, asi
    // que no aplica — uso uno fuera del bbox).
    findManyMock.mockResolvedValue([
      makeListing({ id: "in", lat: 37.88, lng: -4.78 }),
      makeListing({ id: "no-coords", lat: null, lng: null }),
    ]);
    countMock.mockResolvedValue(2);

    const result = await listOpportunityListings({ polygon });

    const call = findManyMock.mock.calls[0]![0]!;
    expect(call.where.lat).toEqual({ gte: 37.87, lte: 37.89 });
    expect(call.where.lng).toEqual({ gte: -4.79, lte: -4.77 });

    expect(result.items.map((i) => i.id)).toEqual(["in"]);
    expect(result.meta.polygonApplied).toBe(true);
    expect(result.meta.sourcesWithoutCoords).toContain("source_a");
  });

  it("paginacion: cursor presente cuando hay mas resultados", async () => {
    const rows = Array.from({ length: 51 }, (_, i) =>
      makeListing({
        id: `r-${i}`,
        lastSeenAt: new Date(2026, 0, 1, 12, 0, i),
      }),
    );
    findManyMock.mockResolvedValue(rows);
    countMock.mockResolvedValue(200);

    const result = await listOpportunityListings({ limit: 50 });
    expect(result.items).toHaveLength(50);
    expect(result.cursor).not.toBeNull();
    const decoded = decodeListingCursor(result.cursor!);
    expect(decoded).not.toBeNull();
    expect(decoded!.id).toBe(result.items[49]!.id);
  });

  it("paginacion: sin cursor cuando hay menos que limit", async () => {
    findManyMock.mockResolvedValue([makeListing()]);
    countMock.mockResolvedValue(1);

    const result = await listOpportunityListings({ limit: 50 });
    expect(result.cursor).toBeNull();
  });

  it("hasPhone: usa OR con advertiser.phoneCanonical o phones non-empty", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);

    await listOpportunityListings({ hasPhone: true });

    const call = findManyMock.mock.calls[0]![0]!;
    expect(call.where.OR).toBeDefined();
    expect(call.where.OR).toEqual(
      expect.arrayContaining([
        { advertiser: { phoneCanonical: { not: null } } },
        { phones: { isEmpty: false } },
      ]),
    );
  });

  it("DTO incluye campos pedidos por la UI (direccion, m2, ppm, hab, ciudad, zona, telefono)", async () => {
    findManyMock.mockResolvedValue([
      makeListing({
        builtArea: 80,
        rooms: 2,
        bathrooms: 1,
        price: 160000,
        pricePerMeter: 2000,
        assignedComercialId: "com-1",
        assignedComercialNombre: "Marina",
        assignedAt: new Date("2026-05-06T13:00:00Z"),
      }),
    ]);
    countMock.mockResolvedValue(1);

    const result = await listOpportunityListings({});
    const item = result.items[0]!;
    expect(item.addressApprox).toBe("Calle Real 1");
    expect(item.builtArea).toBe(80);
    expect(item.pricePerMeter).toBe(2000);
    expect(item.rooms).toBe(2);
    expect(item.bathrooms).toBe(1);
    expect(item.city).toBe("cordoba");
    expect(item.zone).toBe("Centro");
    expect(item.phoneCanonical).toBe("+34600111222");
    expect(item.assignedComercialId).toBe("com-1");
    expect(item.assignedComercialNombre).toBe("Marina");
    expect(item.assignedAt).toBe("2026-05-06T13:00:00.000Z");
  });
});
