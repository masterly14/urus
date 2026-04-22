import { describe, expect, it } from "vitest";
import {
  cleanString,
  cleanNumber,
  pickFirstString,
  pickClientCode,
  toMoney,
  formatMoneyLiteralFallback,
  buildStreetLine,
  mapClientToPerson,
  toMissingCategory,
  buildIncompleteValidationSignal,
  asRecord,
} from "../shared";

describe("shared extraction utilities", () => {
  describe("cleanString", () => {
    it("trims whitespace", () => {
      expect(cleanString("  hello  ")).toBe("hello");
    });

    it("returns empty string for non-strings", () => {
      expect(cleanString(null)).toBe("");
      expect(cleanString(undefined)).toBe("");
      expect(cleanString(42)).toBe("");
    });
  });

  describe("cleanNumber", () => {
    it("returns numbers as-is", () => {
      expect(cleanNumber(42)).toBe(42);
    });

    it("parses numeric strings", () => {
      expect(cleanNumber("42.5")).toBe(42.5);
    });

    it("normalizes comma as decimal separator", () => {
      expect(cleanNumber("42,5")).toBe(42.5);
    });

    it("returns null for non-parseable", () => {
      expect(cleanNumber("abc")).toBe(null);
      expect(cleanNumber(null)).toBe(null);
    });
  });

  describe("pickFirstString", () => {
    it("returns first matching non-empty value", () => {
      const record = { a: "", b: "hello", c: "world" };
      expect(pickFirstString(record, ["a", "b", "c"])).toBe("hello");
    });

    it("returns empty string when no match", () => {
      expect(pickFirstString({}, ["x", "y"])).toBe("");
    });
  });

  describe("pickClientCode", () => {
    it("picks numeric value from record", () => {
      expect(pickClientCode({ cod_cli: 42 }, ["cod_cli"])).toBe(42);
    });

    it("picks from string representation", () => {
      expect(pickClientCode({ cod_cli: "42" }, ["cod_cli"])).toBe(42);
    });

    it("returns null when no keys match", () => {
      expect(pickClientCode({}, ["cod_cli"])).toBe(null);
    });

    it("skips zero values", () => {
      expect(pickClientCode({ cod_cli: 0 }, ["cod_cli"])).toBe(null);
    });
  });

  describe("toMoney", () => {
    it("creates MoneyEUR with amount and auto-literal", () => {
      const m = toMoney(1000);
      expect(m.amount).toBe(1000);
      expect(m.literalEs).toContain("euros");
    });

    it("uses override literal when provided", () => {
      const m = toMoney(1000, "mil euros");
      expect(m.literalEs).toBe("mil euros");
    });
  });

  describe("formatMoneyLiteralFallback", () => {
    it("formats Spanish locale", () => {
      expect(formatMoneyLiteralFallback(250000)).toContain("250.000");
      expect(formatMoneyLiteralFallback(250000)).toContain("euros");
    });
  });

  describe("buildStreetLine", () => {
    it("joins street components", () => {
      expect(buildStreetLine({ street: "Calle Sol", number: "12", floor: "3A" })).toBe(
        "Calle Sol 12 3A",
      );
    });

    it("skips empty components", () => {
      expect(buildStreetLine({ street: "Calle Sol", number: "", floor: "" })).toBe("Calle Sol");
    });
  });

  describe("mapClientToPerson", () => {
    it("builds NaturalPerson from cliente", () => {
      const person = mapClientToPerson(
        {
          cod_cli: 1,
          nombre: "Juan",
          apellidos: "Perez",
          nif: "12345678A",
          calle: "Gran Via",
          numero: "10",
          cp: "28013",
          localidad: "Madrid",
          provincia: "Madrid",
        } as any,
        "Fallback",
        "FallbackCity",
      );
      expect(person.fullName).toBe("Juan Perez");
      expect(person.nationalId).toBe("12345678A");
      expect(person.fiscalAddress.municipality).toBe("Madrid");
    });

    it("uses fallback name when client is null", () => {
      const person = mapClientToPerson(null, "Anónimo", "Sevilla");
      expect(person.fullName).toBe("Anónimo");
      expect(person.fiscalAddress.municipality).toBe("Sevilla");
    });
  });

  describe("asRecord", () => {
    it("returns object as-is", () => {
      const obj = { a: 1 };
      expect(asRecord(obj)).toBe(obj);
    });

    it("returns empty object for null", () => {
      expect(asRecord(null)).toEqual({});
    });

    it("returns empty object for arrays", () => {
      expect(asRecord([1, 2])).toEqual({});
    });
  });

  describe("toMissingCategory", () => {
    it("maps nationalId fields to dni", () => {
      expect(toMissingCategory("buyers[0].nationalId")).toBe("dni");
    });

    it("maps fiscalAddress fields to domicilio", () => {
      expect(toMissingCategory("sellers[0].fiscalAddress.streetLine")).toBe("domicilio");
    });

    it("maps property.addressLine to domicilio", () => {
      expect(toMissingCategory("property.addressLine")).toBe("domicilio");
    });

    it("maps price fields to precio", () => {
      expect(toMissingCategory("totalPurchasePrice.amount")).toBe("precio");
      expect(toMissingCategory("arrasAmount.literalEs")).toBe("precio");
      expect(toMissingCategory("offeredPrice.amount")).toBe("precio");
      expect(toMissingCategory("senalAmount.amount")).toBe("precio");
    });

    it("maps timeline fields to plazos", () => {
      expect(toMissingCategory("timelines.maxDeedDateIso")).toBe("plazos");
    });

    it("returns null for unknown paths", () => {
      expect(toMissingCategory("unknown.field")).toBe(null);
    });
  });

  describe("buildIncompleteValidationSignal", () => {
    it("creates signal with correct documentKind", () => {
      const signal = buildIncompleteValidationSignal(
        "senal_compra",
        "DEM-1",
        "1001",
        "OP-2026-0001",
        "com-001",
        [
          {
            event: "DATOS_INCOMPLETOS",
            documentKind: "senal_compra",
            fieldPath: "offeredPrice.amount",
            message: "Falta precio",
          },
        ],
      );
      expect(signal.event.documentKind).toBe("senal_compra");
      expect(signal.event.missingRequiredCategories).toContain("precio");
      expect(signal.commercialTask.assignedCommercialId).toBe("com-001");
      expect(signal.commercialTask.title).toContain("señal de compra");
    });

    it("deduplicates missing categories", () => {
      const signal = buildIncompleteValidationSignal(
        "arras",
        "DEM-1",
        "1001",
        "OP-2026-0001",
        "com-001",
        [
          { event: "DATOS_INCOMPLETOS", documentKind: "arras", fieldPath: "totalPurchasePrice.amount", message: "a" },
          { event: "DATOS_INCOMPLETOS", documentKind: "arras", fieldPath: "arrasAmount.amount", message: "b" },
        ],
      );
      const count = signal.event.missingRequiredCategories.filter((c) => c === "precio").length;
      expect(count).toBe(1);
    });
  });
});
