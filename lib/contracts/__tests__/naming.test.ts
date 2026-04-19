import { describe, expect, it } from "vitest";
import {
  buildContractVersionStem,
  isCanonicalContractVersionStem,
  parseContractVersionStem,
} from "../naming";

describe("buildContractVersionStem", () => {
  it("construye OP-2026-0001_Arras_v1", () => {
    expect(buildContractVersionStem("OP-2026-0001", "arras", 1)).toBe(
      "OP-2026-0001_Arras_v1",
    );
  });

  it("incrementa versión numérica", () => {
    expect(buildContractVersionStem("OP-2026-0001", "arras", 3)).toBe(
      "OP-2026-0001_Arras_v3",
    );
  });

  it("mapea senal_compra y oferta_firme", () => {
    expect(buildContractVersionStem("OP-X", "senal_compra", 1)).toBe("OP-X_Senal_v1");
    expect(buildContractVersionStem("OP-X", "oferta_firme", 2)).toBe(
      "OP-X_OfertaFirme_v2",
    );
  });

  it("normaliza operationId con trim", () => {
    expect(buildContractVersionStem("  OP-1  ", "arras", 1)).toBe("OP-1_Arras_v1");
  });

  it("fuerza mínimo v1", () => {
    expect(buildContractVersionStem("OP-1", "arras", 0)).toBe("OP-1_Arras_v1");
    expect(buildContractVersionStem("OP-1", "arras", -2)).toBe("OP-1_Arras_v1");
  });
});

describe("parseContractVersionStem", () => {
  it("parsea stem válido", () => {
    expect(parseContractVersionStem("OP-2026-0001_Arras_v2")).toEqual({
      operationId: "OP-2026-0001",
      documentKind: "arras",
      versionNumber: 2,
    });
  });

  it("devuelve null si no coincide", () => {
    expect(parseContractVersionStem("2025.03.m8-v1")).toBeNull();
    expect(parseContractVersionStem("Contrato_Arras_x")).toBeNull();
    expect(parseContractVersionStem(undefined)).toBeNull();
  });
});

describe("isCanonicalContractVersionStem", () => {
  it("true solo para stems canónicos", () => {
    expect(isCanonicalContractVersionStem("OP-1_Arras_v1")).toBe(true);
    expect(isCanonicalContractVersionStem("2025.03.m8-v1")).toBe(false);
  });
});
