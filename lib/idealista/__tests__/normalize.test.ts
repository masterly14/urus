import { describe, expect, it } from "vitest";
import {
  canonicalizeIdealistaUrl,
  extractListingId,
  extractPrice,
  normalizeListingFields,
} from "../normalize";

describe("idealista normalize", () => {
  it("extrae campos principales desde texto visible", () => {
    const listing = normalizeListingFields({
      city: "cordoba",
      operation: "sale",
      url: "https://www.idealista.com/inmueble/108493331/",
      title: "Piso en plaza de Colon, Centro, Cordoba",
      rawText: "Piso en plaza de Colon, Centro, Cordoba 280.000€ 4 hab. 146 m² Planta 3ª exterior con ascensor",
      imageUrls: ["https://img.example/a.jpg"],
      capturedAt: "2026-04-30T00:00:00.000Z",
    });

    expect(listing.listingId).toBe("108493331");
    expect(listing.price).toBe(280000);
    expect(listing.surfaceM2).toBe(146);
    expect(listing.rooms).toBe(4);
    expect(listing.floor).toBe("Planta 3ª");
  });

  it("normaliza URL y elimina tracking basico", () => {
    expect(
      canonicalizeIdealistaUrl("https://www.idealista.com/inmueble/123/?utm_source=x&ordenado-por=precios"),
    ).toBe("https://www.idealista.com/inmueble/123/");
  });

  it("extrae precio e ID cuando existen", () => {
    expect(extractPrice("450.000€").price).toBe(450000);
    expect(extractListingId("https://www.idealista.com/inmueble/999888777/")).toBe("999888777");
  });
});
