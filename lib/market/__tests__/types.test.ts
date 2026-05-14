import { describe, expect, it } from "vitest";
import {
  MarketCircuitBreakerStatus as PrismaMarketCircuitBreakerStatus,
  MarketEventType as PrismaMarketEventType,
  MarketHousingType as PrismaMarketHousingType,
  MarketListingStatus as PrismaMarketListingStatus,
  MarketOperation as PrismaMarketOperation,
  MarketSource as PrismaMarketSource,
} from "@prisma/client";
import {
  MARKET_HOUSING_TYPES,
  MARKET_LISTING_STATUSES,
  MARKET_OPERATIONS,
  MARKET_SOURCES,
} from "@/lib/market/types";

/**
 * Guardarraíl: si Prisma cambia un enum del Core y no actualizamos los
 * literales en `lib/market/types.ts`, este test rompe en CI antes de que
 * llegue a un PR. Mantiene un único punto de verdad.
 */
describe("market enums vs Prisma", () => {
  it("MARKET_SOURCES coincide con Prisma.MarketSource", () => {
    const prismaValues = Object.values(PrismaMarketSource).sort();
    const localValues = [...MARKET_SOURCES].sort();
    expect(localValues).toEqual(prismaValues);
  });

  it("MARKET_OPERATIONS coincide con Prisma.MarketOperation", () => {
    const prismaValues = Object.values(PrismaMarketOperation).sort();
    const localValues = [...MARKET_OPERATIONS].sort();
    expect(localValues).toEqual(prismaValues);
  });

  it("MARKET_HOUSING_TYPES coincide con Prisma.MarketHousingType", () => {
    const prismaValues = Object.values(PrismaMarketHousingType).sort();
    const localValues = [...MARKET_HOUSING_TYPES].sort();
    expect(localValues).toEqual(prismaValues);
  });

  it("MARKET_LISTING_STATUSES coincide con Prisma.MarketListingStatus", () => {
    const prismaValues = Object.values(PrismaMarketListingStatus).sort();
    const localValues = [...MARKET_LISTING_STATUSES].sort();
    expect(localValues).toEqual(prismaValues);
  });

  it("MarketEventType y MarketCircuitBreakerStatus existen en Prisma", () => {
    // Comprobaciones blandas: los tipos existen y tienen >= 1 valor.
    expect(Object.values(PrismaMarketEventType).length).toBeGreaterThan(0);
    expect(Object.values(PrismaMarketCircuitBreakerStatus).length).toBeGreaterThan(0);
  });
});
