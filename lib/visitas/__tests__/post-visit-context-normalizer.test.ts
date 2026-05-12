import { describe, expect, it } from "vitest";
import { normalizePostVisitContext } from "../post-visit-context-normalizer";

describe("normalizePostVisitContext", () => {
  it("extrae restricciones duras, preferencias blandas y rechazos", () => {
    const result = normalizePostVisitContext(
      "Se le hizo pequeño. Quiere mínimo 3 habitaciones, hasta 230k, con terraza y evitar ruido.",
    );

    expect(result).toMatchObject({
      source: "commercial_post_visit",
      hardConstraints: {
        habitacionesMin: 3,
        precioMax: 230000,
      },
      softPreferences: {
        extras: expect.arrayContaining(["terraza"]),
      },
      rejections: expect.arrayContaining(["tamaño insuficiente", "ruido"]),
    });
    expect(result?.autoPromotableVariables).toMatchObject({
      habitacionesMin: 3,
      precioMax: 230000,
    });
    expect(result?.requiresBuyerConfirmation).toEqual(expect.arrayContaining(["extras", "rejections"]));
  });

  it("devuelve null si no hay texto útil", () => {
    expect(normalizePostVisitContext("   ")).toBeNull();
  });
});
