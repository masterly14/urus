import { describe, expect, it } from "vitest";
import {
  canonicalizeFotocasaUrl,
  extractListingId,
  extractPrice,
  normalizeListingFields,
} from "../normalize";

describe("fotocasa normalize", () => {
  it("extrae precio, metros, habitaciones y banos desde texto visible", () => {
    const listing = normalizeListingFields({
      city: "cordoba",
      operation: "sale",
      url: "https://www.fotocasa.es/es/comprar/vivienda/cordoba-capital/terraza/185808727/d",
      title: "Piso de 95 m2 en Ciudad Jardin - Zoco",
      rawText: "Piso en Ciudad Jardin - Zoco 145.000 € 3 habs. 2 baños 95 m² 2ª Planta",
      imageUrls: ["https://img.example/a.jpg"],
      capturedAt: "2026-04-30T00:00:00.000Z",
    });

    expect(listing.price).toBe(145000);
    expect(listing.surfaceM2).toBe(95);
    expect(listing.rooms).toBe(3);
    expect(listing.bathrooms).toBe(2);
    expect(listing.floor).toBe("2ª Planta");
    expect(listing.listingId).toBe("185808727");
  });

  it("normaliza URL y elimina tracking basico", () => {
    expect(
      canonicalizeFotocasaUrl(
        "https://www.fotocasa.es/es/comprar/pisos/sevilla/l?from=list&utm_source=x&id=1",
      ),
    ).toBe("https://www.fotocasa.es/es/comprar/pisos/sevilla/l?id=1");
  });

  it("extrae precio e id cuando existen", () => {
    expect(extractPrice("450.000 €").price).toBe(450000);
    expect(extractListingId("https://www.fotocasa.es/es/comprar/vivienda/x/185808727/d")).toBe(
      "185808727",
    );
  });

  it("ignora el contador de fotos cuando viene pegado al precio", () => {
    expect(extractPrice("LAMSA1/36139.000 €4.000 €Ha bajado").price).toBe(139000);
    expect(extractPrice("Barin1/48419.000 €Hace 34 dias").price).toBe(419000);
  });
});
