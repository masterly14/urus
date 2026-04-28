import { describe, expect, it } from "vitest";
import {
  buildCadastralRefWarning,
  looksLikeSpanishCadastralRef,
  normalizeCadastralRef,
} from "@/lib/nota-encargo/cadastral-ref";

describe("cadastral ref helpers", () => {
  it("normaliza espacios y mayúsculas", () => {
    expect(normalizeCadastralRef(" 9872023 vh5797s 0006xs ")).toBe(
      "9872023VH5797S0006XS",
    );
  });

  it("reconoce referencias catastrales españolas estándar", () => {
    expect(looksLikeSpanishCadastralRef("9872023VH5797S0006XS")).toBe(true);
  });

  it("devuelve warning no bloqueante para formatos no estándar", () => {
    expect(buildCadastralRefWarning("ABC123")).toContain("se guardará igualmente");
  });

  it("marca vacío como obligatorio", () => {
    expect(buildCadastralRefWarning("   ")).toContain("obligatoria");
  });
});
