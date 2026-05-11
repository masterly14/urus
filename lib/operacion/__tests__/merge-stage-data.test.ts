import { describe, it, expect } from "vitest";
import { expandDottedKeys, deepMerge } from "../merge-stage-data";
import { validateStageRequirements } from "../stage-requirements";

describe("expandDottedKeys", () => {
  it("returns empty object for null / undefined / non-object input", () => {
    expect(expandDottedKeys(null)).toEqual({});
    expect(expandDottedKeys(undefined)).toEqual({});
  });

  it("expands a single dot path into nested objects", () => {
    expect(expandDottedKeys({ "buyer.fullName": "Juan" })).toEqual({
      buyer: { fullName: "Juan" },
    });
  });

  it("expands multiple sibling dot paths into the same parent", () => {
    expect(
      expandDottedKeys({
        "buyer.fullName": "Juan",
        "buyer.nationalId": "12345678A",
      }),
    ).toEqual({
      buyer: { fullName: "Juan", nationalId: "12345678A" },
    });
  });

  it("expands `[]` notation into a single-element array", () => {
    expect(
      expandDottedKeys({ "buyers[].fullName": "Comprador 1" }),
    ).toEqual({
      buyers: [{ fullName: "Comprador 1" }],
    });
  });

  it("expands deeply nested paths", () => {
    expect(
      expandDottedKeys({ "timelines.maxDeedDateIso": "2026-12-31" }),
    ).toEqual({
      timelines: { maxDeedDateIso: "2026-12-31" },
    });
  });

  it("keeps top-level keys without dots as-is", () => {
    expect(expandDottedKeys({ offeredPrice: 200000 })).toEqual({
      offeredPrice: 200000,
    });
  });

  it("ignores entries with undefined / null / empty-string values", () => {
    expect(
      expandDottedKeys({
        "buyer.fullName": "",
        "buyer.nationalId": null as unknown as string,
        "buyer.email": undefined as unknown as string,
        "property.addressLine": "Calle Mayor 1",
      }),
    ).toEqual({
      property: { addressLine: "Calle Mayor 1" },
    });
  });

  it("does not overwrite an existing scalar when a longer path conflicts", () => {
    const result = expandDottedKeys({
      "buyer": "valor escalar conflictivo",
      "buyer.fullName": "Juan",
    });
    // El escalar previo gana porque ya está fijado; ignoramos la rama en conflicto.
    expect(result.buyer).toBe("valor escalar conflictivo");
  });
});

describe("deepMerge", () => {
  it("returns base when override is empty", () => {
    expect(deepMerge({ a: 1 }, {})).toEqual({ a: 1 });
  });

  it("returns override when base is empty", () => {
    expect(deepMerge({}, { a: 1 })).toEqual({ a: 1 });
  });

  it("merges nested objects, with override winning on collisions", () => {
    const merged = deepMerge(
      { buyer: { fullName: "Juan", nationalId: "OLD" } },
      { buyer: { nationalId: "NEW" } },
    );
    expect(merged).toEqual({
      buyer: { fullName: "Juan", nationalId: "NEW" },
    });
  });

  it("merges arrays element-wise", () => {
    const merged = deepMerge(
      { buyers: [{ fullName: "Juan", nationalId: "X" }] },
      { buyers: [{ fullName: "Pedro" }] },
    );
    expect(merged).toEqual({
      buyers: [{ fullName: "Pedro", nationalId: "X" }],
    });
  });

  it("does not let override fields with `undefined` clear base values", () => {
    const merged = deepMerge(
      { buyer: { fullName: "Juan" } },
      { buyer: { fullName: undefined as unknown as string } },
    );
    expect(merged).toEqual({ buyer: { fullName: "Juan" } });
  });
});

describe("integration with validateStageRequirements", () => {
  it("OFERTA_FIRME: resolver-shape data passes validation", () => {
    const resolved = {
      buyer: { fullName: "Juan García", nationalId: "12345678A" },
      buyers: [{ fullName: "Juan García", nationalId: "12345678A" }],
      property: {
        addressLine: "Calle Mayor 1",
        cadastralReference: "1234567AB1234N0001XR",
      },
    };
    const manualExpanded = expandDottedKeys({
      offeredPrice: 200000,
      offerDeposit: 5000,
    });
    const available = deepMerge(resolved, manualExpanded);
    expect(validateStageRequirements("OFERTA_FIRME", available)).toEqual([]);
  });

  it("OFERTA_FIRME: only manual fields are reported when buyer + property are resolved", () => {
    const resolved = {
      buyer: { fullName: "Juan", nationalId: "12345678A" },
      buyers: [{ fullName: "Juan", nationalId: "12345678A" }],
      property: { addressLine: "Calle X", cadastralReference: "REF" },
    };
    const missing = validateStageRequirements(
      "OFERTA_FIRME",
      deepMerge(resolved, expandDottedKeys({})),
    );
    const fields = missing.map((m) => m.field).sort();
    expect(fields).toEqual(["offerDeposit", "offeredPrice"]);
  });

  it("OFERTA_FIRME: manual override fills a single missing buyer field via dotted key", () => {
    const resolved = {
      buyer: { fullName: "Juan" },
      buyers: [{ fullName: "Juan" }],
      property: { addressLine: "Calle X", cadastralReference: "REF" },
    };
    const manualExpanded = expandDottedKeys({
      "buyer.nationalId": "12345678A",
      offeredPrice: 200000,
      offerDeposit: 5000,
    });
    const missing = validateStageRequirements(
      "OFERTA_FIRME",
      deepMerge(resolved, manualExpanded),
    );
    expect(missing).toEqual([]);
  });
});
