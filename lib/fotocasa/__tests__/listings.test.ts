import { describe, expect, it } from "vitest";
import { dedupeRawCards, normalizeRawCards } from "../listings";

describe("fotocasa listing parser", () => {
  it("deduplica cards por URL", () => {
    const cards = [
      {
        title: "Piso en Cordoba",
        url: "https://www.fotocasa.es/es/comprar/vivienda/cordoba/123456/d",
        text: "Piso 100.000 €",
        imageUrls: [],
      },
      {
        title: "Piso en Cordoba",
        url: "https://www.fotocasa.es/es/comprar/vivienda/cordoba/123456/d",
        text: "Piso 100.000 € duplicado",
        imageUrls: [],
      },
    ];

    expect(dedupeRawCards(cards)).toHaveLength(1);
  });

  it("normaliza solo cards de compra con titulo y URL", () => {
    const listings = normalizeRawCards(
      [
        {
          title: "Piso de 80 m2 en Centro",
          url: "https://www.fotocasa.es/es/comprar/vivienda/cordoba/123456/d",
          text: "Piso 180.000 € 2 habs. 1 baño 80 m²",
          imageUrls: ["https://img.example/1.jpg"],
        },
        {
          title: "Alquiler descartado",
          url: "https://www.fotocasa.es/es/alquiler/vivienda/cordoba/789/d",
          text: "900 €",
          imageUrls: [],
        },
      ],
      { city: "cordoba", operation: "sale" },
    );

    expect(listings).toHaveLength(1);
    expect(listings[0].price).toBe(180000);
    expect(listings[0].surfaceM2).toBe(80);
  });
});
