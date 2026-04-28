import { describe, expect, it } from "vitest";
import { normalizePropertyFromRest } from "@/lib/inmovilla/rest/properties";

describe("normalizePropertyFromRest", () => {
  it("extrae y normaliza rcatastral como refCatastral", () => {
    const property = normalizePropertyFromRest({
      cod_ofer: 123,
      ref: "URUS01VMA",
      rcatastral: " 9872023 vh5797s 0006xs ",
      precioinmo: 250000,
      fecha: "2026-01-01",
      fechaact: "2026-04-28",
    });

    expect(property.refCatastral).toBe("9872023VH5797S0006XS");
  });
});
