import { describe, expect, it } from "vitest";
import {
  computePropertyFingerprint,
  computePropertySimilarity,
  IDENTITY_AUTO_MERGE_THRESHOLD,
  IDENTITY_MANUAL_REVIEW_THRESHOLD,
} from "@/lib/market/identity";
import type { PropertyFingerprintInput } from "@/lib/market/types";

function makeInput(overrides: Partial<PropertyFingerprintInput> = {}): PropertyFingerprintInput {
  return {
    city: "Córdoba",
    zone: "Centro",
    builtArea: 82,
    rooms: 3,
    bathrooms: 1,
    floor: "3",
    geohash: "eyk6n0u",
    housingType: "flat",
    operation: "sale",
    addressApprox: "Calle Mayor",
    ...overrides,
  };
}

describe("computePropertyFingerprint", () => {
  it("es determinístico para los mismos inputs", () => {
    const a = computePropertyFingerprint(makeInput());
    const b = computePropertyFingerprint(makeInput());
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("es insensible a tildes y mayúsculas en city/zone", () => {
    const a = computePropertyFingerprint(makeInput({ city: "Córdoba", zone: "Centro" }));
    const b = computePropertyFingerprint(makeInput({ city: "cordoba", zone: "centro" }));
    expect(a).toBe(b);
  });

  it("agrupa áreas dentro del mismo bucket de 5 m²", () => {
    const a = computePropertyFingerprint(makeInput({ builtArea: 80 }));
    const b = computePropertyFingerprint(makeInput({ builtArea: 84 })); // mismo bucket [80, 85)
    expect(a).toBe(b);
  });

  it("cambia cuando cambia el bucket de área", () => {
    const a = computePropertyFingerprint(makeInput({ builtArea: 80 }));
    const b = computePropertyFingerprint(makeInput({ builtArea: 90 })); // bucket distinto
    expect(a).not.toBe(b);
  });

  it("cambia con distinta tipología u operación", () => {
    const base = computePropertyFingerprint(makeInput());
    const distintaTipologia = computePropertyFingerprint(makeInput({ housingType: "house" }));
    const distintaOperacion = computePropertyFingerprint(makeInput({ operation: "rent" }));
    expect(base).not.toBe(distintaTipologia);
    expect(base).not.toBe(distintaOperacion);
  });

  it("usa fallback no-geo cuando no hay geohash", () => {
    const a = computePropertyFingerprint(makeInput({ geohash: null }));
    const b = computePropertyFingerprint(makeInput({ geohash: null }));
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("computePropertySimilarity", () => {
  it("dos inputs idénticos dan score 1 y auto-merge", () => {
    const r = computePropertySimilarity(makeInput(), makeInput());
    expect(r.score).toBe(1);
    expect(r.decision).toBe("auto-merge");
    expect(r.score).toBeGreaterThanOrEqual(IDENTITY_AUTO_MERGE_THRESHOLD);
  });

  it("operación distinta fuerza no-merge inmediato", () => {
    const r = computePropertySimilarity(
      makeInput(),
      makeInput({ operation: "rent" }),
    );
    expect(r.score).toBe(0);
    expect(r.decision).toBe("no-merge");
  });

  it("tipología distinta fuerza no-merge inmediato", () => {
    const r = computePropertySimilarity(
      makeInput({ housingType: "flat" }),
      makeInput({ housingType: "house" }),
    );
    expect(r.score).toBe(0);
    expect(r.decision).toBe("no-merge");
  });

  it("dos anuncios del mismo inmueble en portales distintos llegan a auto-merge", () => {
    const portalA = makeInput({
      builtArea: 82,
      addressApprox: "Calle Mayor 15",
    });
    const portalB = makeInput({
      builtArea: 81, // pequeña diferencia entre portales
      addressApprox: "Calle Mayor",
    });
    const r = computePropertySimilarity(portalA, portalB);
    expect(r.score).toBeGreaterThanOrEqual(IDENTITY_AUTO_MERGE_THRESHOLD);
    expect(r.decision).toBe("auto-merge");
  });

  it("inmuebles parecidos pero con datos parciales caen a manual-review", () => {
    const a = makeInput({
      builtArea: 82,
      rooms: 3,
      bathrooms: 1,
      floor: "3",
      addressApprox: null,
      geohash: "eyk6n0u",
    });
    const b = makeInput({
      builtArea: 80,
      rooms: 3,
      bathrooms: 1,
      floor: "3",
      addressApprox: null,
      geohash: "eyk6n0v", // mismo barrio, celda contigua → prefijo común alto
    });
    const r = computePropertySimilarity(a, b);
    expect(r.score).toBeGreaterThanOrEqual(IDENTITY_MANUAL_REVIEW_THRESHOLD);
    expect(r.score).toBeLessThan(IDENTITY_AUTO_MERGE_THRESHOLD);
    expect(r.decision).toBe("manual-review");
  });

  it("inmuebles muy distintos en métrica + geo lejano dan no-merge", () => {
    const a = makeInput({
      builtArea: 50,
      rooms: 1,
      geohash: "eyk6n0u",
      city: "Córdoba",
      zone: "Centro",
    });
    const b = makeInput({
      builtArea: 200,
      rooms: 5,
      geohash: "ezzaaaa", // geohash totalmente distinto
      city: "Sevilla",
      zone: "Triana",
    });
    const r = computePropertySimilarity(a, b);
    expect(r.score).toBeLessThan(IDENTITY_MANUAL_REVIEW_THRESHOLD);
    expect(r.decision).toBe("no-merge");
  });

  it("componentes ausentes contribuyen 0, no rompen el cálculo", () => {
    const a = makeInput({
      builtArea: null,
      rooms: null,
      bathrooms: null,
      floor: null,
      addressApprox: null,
      geohash: null,
    });
    const b = makeInput({
      builtArea: null,
      rooms: null,
      bathrooms: null,
      floor: null,
      addressApprox: null,
      geohash: null,
    });
    const r = computePropertySimilarity(a, b);
    // Solo aporta city+zone (geo fallback) y housingType.
    expect(Number.isFinite(r.score)).toBe(true);
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThanOrEqual(1);
  });
});
