import { describe, expect, it } from "vitest";
import { flattenContractPayloadForDisplay } from "../flatten-payload-for-display";

describe("flattenContractPayloadForDisplay", () => {
  it("aplana primitivos y objetos anidados con grupos por raíz", () => {
    const rows = flattenContractPayloadForDisplay({
      documentDateIso: "2026-01-01",
      property: { addressLine: "Calle 1", extra: null },
      buyers: [{ fullName: "Ana", age: 30 }],
    });

    const paths = rows.map((r) => r.path);
    expect(paths).toContain("documentDateIso");
    expect(paths).toContain("property.addressLine");
    expect(paths).toContain("property.extra");
    expect(paths).toContain("buyers[0].fullName");
    expect(paths).toContain("buyers[0].age");

    const doc = rows.find((r) => r.path === "documentDateIso");
    expect(doc?.value).toBe("2026-01-01");
    expect(doc?.group).toBe("documentDateIso");

    const addr = rows.find((r) => r.path === "property.addressLine");
    expect(addr?.group).toBe("property");

    const buyerName = rows.find((r) => r.path === "buyers[0].fullName");
    expect(buyerName?.group).toBe("buyers");
  });
});
