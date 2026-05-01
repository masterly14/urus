import { describe, expect, it } from "vitest";
import { dedupeRawCards, normalizeRawCards } from "../listings";

describe("idealista listing parser", () => {
  it("deduplica cards por URL", () => {
    const cards = [
      {
        title: "Piso en Centro, Cordoba",
        url: "https://www.idealista.com/inmueble/108493331/",
        text: "Piso 280.000€ 4 hab. 146 m²",
        priceRaw: "280.000€",
        imageUrls: [],
      },
      {
        title: "Piso en Centro, Cordoba",
        url: "https://www.idealista.com/inmueble/108493331/",
        text: "Duplicado",
        priceRaw: "280.000€",
        imageUrls: [],
      },
    ];

    expect(dedupeRawCards(cards)).toHaveLength(1);
  });

  it("normaliza cards de venta con URL de inmueble", () => {
    const listings = normalizeRawCards(
      [
        {
          title: "Piso en plaza de Colon, Centro, Cordoba",
          url: "https://www.idealista.com/inmueble/108493331/",
          text: "Piso en plaza de Colon, Centro, Cordoba 280.000€ 4 hab. 146 m² Planta 3ª",
          priceRaw: "280.000€",
          agencyName: "Inmolike",
          imageUrls: ["https://img.example/1.jpg"],
        },
      ],
      { city: "cordoba", operation: "sale" },
    );

    expect(listings).toHaveLength(1);
    expect(listings[0].source).toBe("idealista");
    expect(listings[0].listingId).toBe("108493331");
    expect(listings[0].price).toBe(280000);
    expect(listings[0].surfaceM2).toBe(146);
    expect(listings[0].agencyName).toBe("Inmolike");
  });
});
