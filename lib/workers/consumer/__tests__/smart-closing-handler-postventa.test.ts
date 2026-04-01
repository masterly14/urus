import { describe, it, expect } from "vitest";
import {
  isOperacionCerrada,
  isSmartClosingTrigger,
  OPERACION_CERRADA_KEYWORDS,
} from "../smart-closing-handler";

describe("isOperacionCerrada", () => {
  it.each([
    "Vendido",
    "Vendida",
    "vendido",
    "VENDIDO",
    "Alquilado",
    "Alquilada",
    "alquilado",
    "ALQUILADA",
    "Vivienda Vendida",
  ])("devuelve true para '%s'", (estado) => {
    expect(isOperacionCerrada(estado)).toBe(true);
  });

  it.each([
    "Activo",
    "Reserva",
    "Reservada",
    "Arras",
    "No disponible",
    "Libre",
    "",
  ])("devuelve false para '%s'", (estado) => {
    expect(isOperacionCerrada(estado)).toBe(false);
  });

  it("no intersecta con isSmartClosingTrigger", () => {
    for (const kw of OPERACION_CERRADA_KEYWORDS) {
      expect(isSmartClosingTrigger(kw)).toBe(false);
    }
  });
});
