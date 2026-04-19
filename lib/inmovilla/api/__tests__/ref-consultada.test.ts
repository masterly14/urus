import { describe, it, expect } from "vitest";
import {
  parseConsultadaPropertyRef,
  extractRefConsultadaFromDemandMap,
} from "../ref-consultada";

describe("parseConsultadaPropertyRef", () => {
  it("acepta prefijo Ref.", () => {
    expect(parseConsultadaPropertyRef("Ref. URUS103VMA")).toBe("URUS103VMA");
  });

  it("acepta ref sin prefijo", () => {
    expect(parseConsultadaPropertyRef("URUS103VMA")).toBe("URUS103VMA");
  });

  it("acepta variante URUSV57MA", () => {
    expect(parseConsultadaPropertyRef("Ref. URUSV57MA")).toBe("URUSV57MA");
  });

  it("rechaza numdemanda", () => {
    expect(parseConsultadaPropertyRef("989")).toBeUndefined();
  });

  it("extrae URUS embebido en texto", () => {
    expect(parseConsultadaPropertyRef('Ver propiedad URUS09VFEDE en lista')).toBe(
      "URUS09VFEDE",
    );
  });
});

describe("extractRefConsultadaFromDemandMap", () => {
  it("lee clave consultada", () => {
    expect(
      extractRefConsultadaFromDemandMap({ consultada: "Ref. URUS103VMA" }),
    ).toBe("URUS103VMA");
  });

  it("prioriza la primera clave con valor válido", () => {
    expect(
      extractRefConsultadaFromDemandMap({
        consultada: "",
        refconsultada: "URUS111VMA",
      }),
    ).toBe("URUS111VMA");
  });
});
