import { afterEach, describe, expect, it } from "vitest";
import {
  selectMarketListingImages,
  shouldRequestMarketImageImport,
} from "@/lib/market/image-import";

const ORIGINAL_IMPORT_PORTALS = process.env.MARKET_IMAGE_IMPORT_PORTALS;

afterEach(() => {
  if (ORIGINAL_IMPORT_PORTALS === undefined) {
    delete process.env.MARKET_IMAGE_IMPORT_PORTALS;
  } else {
    process.env.MARKET_IMAGE_IMPORT_PORTALS = ORIGINAL_IMPORT_PORTALS;
  }
});

describe("shouldRequestMarketImageImport", () => {
  it("usa default idealista cuando no hay env", () => {
    delete process.env.MARKET_IMAGE_IMPORT_PORTALS;
    expect(shouldRequestMarketImageImport("source_d")).toBe(true);
    expect(shouldRequestMarketImageImport("source_a")).toBe(false);
  });

  it("permite configurar portales por CSV", () => {
    process.env.MARKET_IMAGE_IMPORT_PORTALS = "idealista, fotocasa";
    expect(shouldRequestMarketImageImport("source_d")).toBe(true);
    expect(shouldRequestMarketImageImport("source_a")).toBe(true);
    expect(shouldRequestMarketImageImport("source_b")).toBe(false);
  });
});

describe("selectMarketListingImages", () => {
  it("prioriza Cloudinary cuando existe cache importado", () => {
    process.env.MARKET_IMAGE_IMPORT_PORTALS = "idealista";
    const selected = selectMarketListingImages({
      source: "source_d",
      importedImages: ["https://res.cloudinary.com/demo/image/upload/x.jpg"],
      portalImages: ["https://www.idealista.com/img.jpg"],
    });
    expect(selected.fotos).toEqual([
      "https://res.cloudinary.com/demo/image/upload/x.jpg",
    ]);
    expect(selected.imageCacheStatus).toBe("IMPORTED");
    expect(selected.shouldQueueImport).toBe(false);
  });

  it("sirve directo por defecto para fotocasa sin marcar pending", () => {
    process.env.MARKET_IMAGE_IMPORT_PORTALS = "idealista";
    const selected = selectMarketListingImages({
      source: "source_a",
      importedImages: [],
      portalImages: ["https://www.fotocasa.es/image.jpg"],
    });
    expect(selected.fotos).toEqual(["https://www.fotocasa.es/image.jpg"]);
    expect(selected.imageCacheStatus).toBeUndefined();
    expect(selected.shouldQueueImport).toBe(false);
  });

  it("mantiene direct URLs en idealista pero encola import lazy", () => {
    process.env.MARKET_IMAGE_IMPORT_PORTALS = "idealista";
    const selected = selectMarketListingImages({
      source: "source_d",
      importedImages: [],
      portalImages: ["https://img4.idealista.com/blur/WEB_DETAIL_TOP-L.jpg"],
    });
    expect(selected.fotos).toEqual([
      "https://img4.idealista.com/blur/WEB_DETAIL_TOP-L.jpg",
    ]);
    expect(selected.imageCacheStatus).toBe("PENDING");
    expect(selected.shouldQueueImport).toBe(true);
  });
});
