import { describe, expect, it } from "vitest";
import { normalizePhone, normalizePhones } from "../phone";

describe("normalizePhone", () => {
  it("normaliza telefono espanol local a E.164", () => {
    expect(normalizePhone("601234567")).toBe("+34601234567");
  });

  it("normaliza formato internacional con espacios", () => {
    expect(normalizePhone("+34 601 23 45 67")).toBe("+34601234567");
  });

  it("normaliza prefijo 00", () => {
    expect(normalizePhone("0034601234567")).toBe("+34601234567");
  });

  it("normaliza parentesis y guiones", () => {
    expect(normalizePhone("(601) 234-567")).toBe("+34601234567");
  });

  it("normaliza prefijo tel:", () => {
    expect(normalizePhone("tel:+34601234567")).toBe("+34601234567");
  });

  it("devuelve null para entradas invalidas", () => {
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("abcde")).toBeNull();
    expect(normalizePhone("+34101234567")).toBeNull();
  });

  it("devuelve null para vacio/null/undefined", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });
});

describe("normalizePhones", () => {
  it("deduplica y elimina invalidos", () => {
    expect(
      normalizePhones([
        "601234567",
        "+34 601 23 45 67",
        "123",
        "tel:+34666777888",
      ]),
    ).toEqual(["+34601234567", "+34666777888"]);
  });
});
