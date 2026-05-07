import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  findManyAdvertiserMock,
  countAdvertiserMock,
  findUniqueAdvertiserMock,
} = vi.hoisted(() => ({
  findManyAdvertiserMock: vi.fn(),
  countAdvertiserMock: vi.fn(),
  findUniqueAdvertiserMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    marketAdvertiser: {
      findMany: findManyAdvertiserMock,
      count: countAdvertiserMock,
      findUnique: findUniqueAdvertiserMock,
    },
  },
}));

import {
  decodeAdvertiserCursor,
  encodeAdvertiserCursor,
  getAdvertiserDetail,
  listAdvertisers,
} from "../advertisers";

function makeAdvertiser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "adv-1",
    phoneCanonical: "+34600111222",
    displayName: "Maria",
    advertiserType: "particular",
    inmovillaContactId: null,
    listingsCount: 1,
    firstSeenAt: new Date("2026-05-06T10:00:00Z"),
    lastSeenAt: new Date("2026-05-06T12:00:00Z"),
    listings: [
      {
        id: "list-1",
        source: "source_d",
        canonicalUrl: "https://www.idealista.com/inmueble/1/",
        externalId: "1",
        city: "cordoba",
        zone: "centro",
        operation: "sale",
        housingType: "flat",
        price: 175000,
        builtArea: 90,
        rooms: 3,
        bathrooms: 2,
        mainImageUrl: null,
        imageUrls: [],
        status: "active",
        firstSeenAt: new Date("2026-05-06T10:00:00Z"),
        lastSeenAt: new Date("2026-05-06T12:00:00Z"),
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  findManyAdvertiserMock.mockResolvedValue([makeAdvertiser()]);
  countAdvertiserMock.mockResolvedValue(1);
  findUniqueAdvertiserMock.mockResolvedValue(null);
});

describe("listAdvertisers", () => {
  it("aplica filtros por advertiserType, hasPhone y sinceHours", async () => {
    await listAdvertisers({
      advertiserType: "particular",
      hasPhone: true,
      sinceHours: 24,
    });

    const where = findManyAdvertiserMock.mock.calls[0]![0]!.where as Record<
      string,
      unknown
    >;
    expect(where.advertiserType).toBe("particular");
    expect(where.phoneCanonical).toEqual({ not: null });
    expect((where.lastSeenAt as { gte: Date }).gte).toBeInstanceOf(Date);
  });

  it("filtra por city via listings.some", async () => {
    await listAdvertisers({ city: "cordoba" });
    const where = findManyAdvertiserMock.mock.calls[0]![0]!.where as Record<
      string,
      unknown
    >;
    expect(where.listings).toEqual({ some: { city: "cordoba" } });
  });

  it("limita a maximo 50 y devuelve cursor cuando hay siguiente pagina", async () => {
    const rows = Array.from({ length: 26 }, (_, i) =>
      makeAdvertiser({ id: `adv-${i + 1}` }),
    );
    findManyAdvertiserMock.mockResolvedValue(rows);
    countAdvertiserMock.mockResolvedValue(rows.length);

    const result = await listAdvertisers({ limit: 25 });
    expect(result.items).toHaveLength(25);
    expect(result.cursor).not.toBeNull();
    const decoded = decodeAdvertiserCursor(result.cursor!);
    expect(decoded?.id).toBe("adv-25");
  });

  it("incluye primary listing en el DTO", async () => {
    const result = await listAdvertisers({});
    expect(result.items[0]!.primary).toMatchObject({
      listingId: "list-1",
      source: "source_d",
      mainImageUrl: null,
      price: 175000,
    });
  });

  it("encode/decode cursor es estable", () => {
    const raw = { lastSeenAt: "2026-05-06T12:00:00.000Z", id: "adv-1" };
    const encoded = encodeAdvertiserCursor(raw);
    expect(decodeAdvertiserCursor(encoded)).toEqual(raw);
    expect(decodeAdvertiserCursor("invalid")).toBeNull();
  });
});

describe("getAdvertiserDetail", () => {
  it("agrupa listings por source", async () => {
    const adv = makeAdvertiser({
      listings: [
        {
          id: "l1",
          source: "source_d",
          canonicalUrl: "https://idealista/1",
          externalId: "1",
          city: "cordoba",
          zone: null,
          operation: "sale",
          housingType: "flat",
          price: 100,
          builtArea: 80,
          rooms: 2,
          bathrooms: 1,
          mainImageUrl: null,
          imageUrls: [],
          status: "active",
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
        },
        {
          id: "l2",
          source: "source_a",
          canonicalUrl: "https://fotocasa/1",
          externalId: "2",
          city: "cordoba",
          zone: null,
          operation: "sale",
          housingType: "flat",
          price: 110,
          builtArea: 80,
          rooms: 2,
          bathrooms: 1,
          mainImageUrl: null,
          imageUrls: [],
          status: "active",
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
        },
      ],
    });
    findUniqueAdvertiserMock.mockResolvedValue(adv);

    const detail = await getAdvertiserDetail("adv-1");
    expect(detail).not.toBeNull();
    expect(detail!.bySource.source_d).toHaveLength(1);
    expect(detail!.bySource.source_a).toHaveLength(1);
    expect(detail!.totalListings).toBe(2);
  });

  it("devuelve null cuando no existe", async () => {
    findUniqueAdvertiserMock.mockResolvedValue(null);
    const detail = await getAdvertiserDetail("adv-missing");
    expect(detail).toBeNull();
  });
});
