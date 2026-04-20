import { describe, it, expect } from "vitest";
import { selectPrimaryPortal } from "../properties";

describe("selectPrimaryPortal", () => {
  it("prioriza Idealista sobre Fotocasa y Pisos.com", () => {
    const result = selectPrimaryPortal({
      pisoscom: {
        state: "10",
        publication_url: "https://www.pisos.com/123",
      },
      idealista: {
        state: "10",
        publication_url: "https://www.idealista.com/inmueble/111",
      },
      fotocasa: {
        state: "10",
        publication_url: "https://www.fotocasa.es/456",
      },
    });
    expect(result?.portalName).toBe("idealista");
    expect(result?.portalUrl).toBe("https://www.idealista.com/inmueble/111");
  });

  it("cae a Fotocasa si Idealista no tiene publication_url", () => {
    const result = selectPrimaryPortal({
      idealista: { state: "10", publication_url: null },
      fotocasa: {
        state: "10",
        publication_url: "https://www.fotocasa.es/456",
      },
    });
    expect(result?.portalName).toBe("fotocasa");
    expect(result?.portalUrl).toBe("https://www.fotocasa.es/456");
  });

  it("cae a Pisos.com tras Fotocasa", () => {
    const result = selectPrimaryPortal({
      fotocasa: { state: "10" },
      pisoscom: {
        state: "10",
        publication_url: "https://www.pisos.com/789",
      },
    });
    expect(result?.portalName).toBe("pisoscom");
  });

  it("acepta portales no listados en PORTAL_PRIORITY como fallback", () => {
    const result = selectPrimaryPortal({
      portalExtraño: {
        state: "10",
        publication_url: "https://ejemplo.com/anuncio/42",
      },
    });
    expect(result?.portalName).toBe("portalExtraño");
  });

  it("devuelve null si ningún portal tiene publication_url", () => {
    expect(
      selectPrimaryPortal({
        idealista: { state: "10", publication_url: null },
        fotocasa: { state: "10" },
        pisoscom: { state: "10", publication_url: "" },
      }),
    ).toBeNull();
  });

  it("devuelve null si publishinfo está vacío o es null", () => {
    expect(selectPrimaryPortal({})).toBeNull();
    expect(selectPrimaryPortal(null)).toBeNull();
    expect(selectPrimaryPortal(undefined)).toBeNull();
  });
});
