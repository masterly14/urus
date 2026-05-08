import { describe, expect, it } from "vitest";
import {
  buildSeedDigest,
  buildWelcomeMessage,
  formatPriceEuros,
  formatPriceRange,
  sanitizeFirstName,
  sanitizeFirstZone,
} from "../welcome-message";

describe("sanitizeFirstName", () => {
  it("devuelve cadena vacia si el valor no existe", () => {
    expect(sanitizeFirstName(null)).toBe("");
    expect(sanitizeFirstName(undefined)).toBe("");
    expect(sanitizeFirstName("")).toBe("");
    expect(sanitizeFirstName("   ")).toBe("");
  });

  it("toma solo el primer nombre", () => {
    expect(sanitizeFirstName("Laura García López")).toBe("Laura");
  });

  it("normaliza nombres en mayúsculas (caso típico Inmovilla)", () => {
    expect(sanitizeFirstName("JUAN PÉREZ FERNÁNDEZ")).toBe("Juan");
  });

  it("preserva nombres con tilde", () => {
    expect(sanitizeFirstName("Andrés Rodríguez")).toBe("Andrés");
  });
});

describe("sanitizeFirstZone", () => {
  it("devuelve null si no hay zonas", () => {
    expect(sanitizeFirstZone(null)).toBeNull();
    expect(sanitizeFirstZone("")).toBeNull();
    expect(sanitizeFirstZone("   ")).toBeNull();
    expect(sanitizeFirstZone(", ,  ,")).toBeNull();
  });

  it("toma la primera zona del CSV", () => {
    expect(sanitizeFirstZone("Centro, Macarena, Triana")).toBe("Centro");
  });

  it("trim y capitalización", () => {
    expect(sanitizeFirstZone("  centro , norte")).toBe("Centro");
  });

  it("respeta zonas multipalabra", () => {
    expect(sanitizeFirstZone("la flota, Norte")).toBe("La flota");
  });
});

describe("formatPriceEuros", () => {
  it("devuelve null para valores no validos", () => {
    expect(formatPriceEuros(null)).toBeNull();
    expect(formatPriceEuros(undefined)).toBeNull();
    expect(formatPriceEuros(0)).toBeNull();
    expect(formatPriceEuros(-100)).toBeNull();
    expect(formatPriceEuros(NaN)).toBeNull();
  });

  it("formatea con separador de miles español", () => {
    expect(formatPriceEuros(200000)).toBe("200.000€");
    expect(formatPriceEuros(1500000)).toBe("1.500.000€");
  });

  it("redondea decimales", () => {
    expect(formatPriceEuros(199999.6)).toBe("200.000€");
  });
});

describe("formatPriceRange", () => {
  it("devuelve null si no hay min ni max validos", () => {
    expect(formatPriceRange(0, 0)).toBeNull();
    expect(formatPriceRange(null, null)).toBeNull();
  });

  it("solo max → muestra el tope", () => {
    expect(formatPriceRange(0, 200000)).toBe("200.000€");
  });

  it("solo min → muestra 'desde X'", () => {
    expect(formatPriceRange(150000, 0)).toBe("desde 150.000€");
  });

  it("min y max → rango", () => {
    expect(formatPriceRange(150000, 220000)).toBe("150.000–220.000€");
  });
});

describe("buildWelcomeMessage", () => {
  const base = {
    nombre: "Laura",
    zonas: null as string | null,
    presupuestoMin: null as number | null,
    presupuestoMax: null as number | null,
    habitacionesMin: null as number | null,
    tipos: null as string | null,
  };

  it("variante A: zona + presupuesto → confirma criterios", () => {
    const msg = buildWelcomeMessage({
      ...base,
      zonas: "Centro, Macarena",
      presupuestoMax: 220000,
    });
    expect(msg).toContain("Centro");
    expect(msg).toContain("220.000€");
    expect(msg).toMatch(/¿Lo dejamos|ajustar/i);
  });

  it("variante B: solo zona → pregunta por presupuesto", () => {
    const msg = buildWelcomeMessage({ ...base, zonas: "Triana" });
    expect(msg).toContain("Triana");
    expect(msg).toMatch(/presupuesto/i);
  });

  it("variante C: solo presupuesto → pregunta por zona", () => {
    const msg = buildWelcomeMessage({ ...base, presupuestoMax: 180000 });
    expect(msg).toContain("180.000€");
    expect(msg).toMatch(/zona/i);
  });

  it("variante D: sin datos → pregunta abierta neutra", () => {
    const msg = buildWelcomeMessage(base);
    expect(msg).toMatch(/zona|presupuesto/i);
    expect(msg).not.toContain("undefined");
    expect(msg).not.toContain("null");
  });

  it("trata 0 y vacios como datos no presentes (variante D)", () => {
    const msg = buildWelcomeMessage({
      ...base,
      zonas: "",
      presupuestoMax: 0,
      presupuestoMin: 0,
    });
    expect(msg).toMatch(/zona|presupuesto/i);
    expect(msg).not.toContain("0€");
  });

  it("longitud razonable para variable de plantilla Meta (≤ 250 chars)", () => {
    const variants = [
      buildWelcomeMessage({ ...base, zonas: "Centro", presupuestoMax: 220000 }),
      buildWelcomeMessage({ ...base, zonas: "Centro" }),
      buildWelcomeMessage({ ...base, presupuestoMax: 220000 }),
      buildWelcomeMessage(base),
    ];
    for (const v of variants) {
      expect(v.length).toBeLessThanOrEqual(250);
      expect(v.length).toBeGreaterThan(20);
    }
  });
});

describe("buildSeedDigest", () => {
  const base = {
    nombre: "Laura",
    zonas: null as string | null,
    presupuestoMin: null as number | null,
    presupuestoMax: null as number | null,
    habitacionesMin: null as number | null,
    tipos: null as string | null,
  };

  it("incluye presupuesto, ubicacion, habitaciones y tipo cuando hay datos", () => {
    const digest = buildSeedDigest({
      ...base,
      zonas: "Centro, Macarena",
      presupuestoMin: 150000,
      presupuestoMax: 220000,
      habitacionesMin: 3,
      tipos: "Piso, Ático",
    });
    expect(digest).toContain("Presupuesto: 150.000–220.000€");
    expect(digest).toContain("Ubicación: Centro, Macarena");
    expect(digest).toContain("≥3 hab");
    expect(digest).toContain("Tipo: Piso, Ático");
  });

  it("omite secciones cuando los datos son cero o vacios", () => {
    const digest = buildSeedDigest({
      ...base,
      zonas: "Centro",
      presupuestoMin: 0,
      presupuestoMax: 200000,
      habitacionesMin: 0,
      tipos: "",
    });
    expect(digest).toContain("Presupuesto: 200.000€");
    expect(digest).toContain("Ubicación: Centro");
    expect(digest).not.toContain("hab");
    expect(digest).not.toContain("Tipo:");
  });

  it("devuelve fallback si no hay ningun criterio", () => {
    const digest = buildSeedDigest(base);
    expect(digest).toMatch(/sin criterios/i);
  });
});
