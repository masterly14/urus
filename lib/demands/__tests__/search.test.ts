import { describe, expect, it } from "vitest";
import { buildDemandPhoneSearchTerms, buildDemandSearchConditions } from "../search";

describe("demand search helpers", () => {
  it("normaliza búsquedas de teléfono con y sin prefijo español", () => {
    expect(buildDemandPhoneSearchTerms("+34 600 111 222")).toEqual(["34600111222", "600111222"]);
    expect(buildDemandPhoneSearchTerms("600 111 222")).toEqual(["600111222", "34600111222"]);
    expect(buildDemandPhoneSearchTerms("0034 600 111 222")).toEqual([
      "0034600111222",
      "34600111222",
      "600111222",
    ]);
  });

  it("incluye codigo, texto y variantes de telefono en la busqueda", () => {
    const conditions = buildDemandSearchConditions("600 111 222");

    expect(conditions).toContainEqual({ codigo: { contains: "600 111 222", mode: "insensitive" } });
    expect(conditions).toContainEqual({ nombre: { contains: "600 111 222", mode: "insensitive" } });
    expect(conditions).toContainEqual({ telefono: { contains: "600111222", mode: "insensitive" } });
    expect(conditions).toContainEqual({ telefono: { contains: "34600111222", mode: "insensitive" } });
  });
});
