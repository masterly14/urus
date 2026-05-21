import { describe, expect, it } from "vitest";
import { buildOptimalPricingSummary } from "@/lib/pricing/optimal-price";
import type { PricingComparable, PricingPropertyInput } from "@/lib/pricing/types";

function makeInput(): PricingPropertyInput {
  return {
    propertyCode: "P-OPT",
    precio: 240000,
    precioM2: 3000,
    metrosConstruidos: 80,
    habitaciones: 3,
    banyos: 2,
    ciudad: "Cordoba",
    zona: "Centro",
    zonaRaw: "Centro",
    keyLoca: 224499,
    keyZona: 1901999,
    tipologiaNombre: "Piso",
    keyTipo: 1,
    tipoOperacion: "sale",
    estado: "Disponible",
    fechaAlta: null,
    fechaActualizacion: null,
    latitud: null,
    longitud: null,
    extras: {
      terraza: false,
      garaje: false,
      ascensor: true,
      trastero: false,
      piscina: false,
      aireAcondicionado: true,
      calefaccion: null,
      anoConstruccion: null,
      certificadoEnergetico: null,
    },
  };
}

function makeComparable(priceM2: number, idx: number): PricingComparable {
  return {
    statefoxId: `cmp-${idx}`,
    precio: priceM2 * 80,
    precioM2: priceM2,
    metrosConstruidos: 80,
    habitaciones: 3,
    banyos: 2,
    ciudad: "Cordoba",
    zona: "Centro",
    tipologia: "Piso",
    advertiserType: "professional",
    extras: {},
    link: null,
    diasPublicado: 10,
    descripcion: null,
    direccion: null,
    fotos: [],
    anunciante: {
      nombre: "Agencia",
      tipo: "professional",
      telefonos: [],
    },
    latitud: null,
    longitud: null,
    planta: null,
    orientacion: null,
    referencia: null,
  };
}

describe("buildOptimalPricingSummary", () => {
  it("calcula baremos por percentiles y rango recomendado", () => {
    const comparables = [2400, 2600, 2800, 3000, 3200, 3400].map(makeComparable);
    const result = buildOptimalPricingSummary(makeInput(), comparables);
    expect(result).toBeDefined();
    expect(result?.p25PriceM2).toBeGreaterThanOrEqual(result?.minPriceM2 ?? 0);
    expect(result?.p50PriceM2).toBeGreaterThanOrEqual(result?.p25PriceM2 ?? 0);
    expect(result?.p75PriceM2).toBeGreaterThanOrEqual(result?.p50PriceM2 ?? 0);
    expect(result?.recommendedMinPrice).toBeLessThanOrEqual(result?.recommendedMaxPrice ?? 0);
  });

  it("devuelve undefined con menos de 3 comparables", () => {
    const comparables = [2500, 2600].map(makeComparable);
    const result = buildOptimalPricingSummary(makeInput(), comparables);
    expect(result).toBeUndefined();
  });
});
