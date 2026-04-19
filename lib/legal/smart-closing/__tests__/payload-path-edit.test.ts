import { describe, expect, it } from "vitest";
import {
  coerceEditedValue,
  getValueAtPath,
  isEditablePayloadPath,
  parsePayloadPath,
  setValueAtPath,
  valuesEqualForPayload,
} from "../payload-path-edit";

describe("parsePayloadPath", () => {
  it("parsea buyers[0].fullName", () => {
    expect(parsePayloadPath("buyers[0].fullName")).toEqual(["buyers", 0, "fullName"]);
  });

  it("parsea clave simple", () => {
    expect(parsePayloadPath("documentDateIso")).toEqual(["documentDateIso"]);
  });
});

describe("getValueAtPath / setValueAtPath", () => {
  it("lee y escribe anidado", () => {
    const root = { a: { b: [10, { c: "x" }] } };
    expect(getValueAtPath(root, ["a", "b", 1, "c"])).toBe("x");
    const clone = structuredClone(root);
    setValueAtPath(clone, ["a", "b", 1, "c"], "y");
    expect(getValueAtPath(clone, ["a", "b", 1, "c"])).toBe("y");
  });
});

describe("coerceEditedValue", () => {
  it("respeta número", () => {
    expect(coerceEditedValue("12,5", 0)).toBe(12.5);
  });

  it("respeta boolean", () => {
    expect(coerceEditedValue("true", false)).toBe(true);
  });
});

describe("valuesEqualForPayload", () => {
  it("compara números NaN", () => {
    expect(valuesEqualForPayload(Number.NaN, Number.NaN)).toBe(true);
  });
});

describe("isEditablePayloadPath", () => {
  it("no permite objeto", () => {
    const p = { flags: { x: true } };
    expect(isEditablePayloadPath(p, "flags")).toBe(false);
    expect(isEditablePayloadPath(p, "flags.x")).toBe(true);
  });
});
