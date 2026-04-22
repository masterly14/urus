import { describe, it, expect } from "vitest";
import {
  OPERACION_STAGE_ORDER,
  CLOSED_ESTADOS,
  stageIndex,
  isAdvance,
  skippedStages,
  isClosedEstado,
  isCancelado,
  isTerminal,
  documentKindForStage,
  STAGE_DOCUMENT_KIND,
} from "../stages";

describe("OPERACION_STAGE_ORDER", () => {
  it("has 5 stages in the correct order", () => {
    expect(OPERACION_STAGE_ORDER).toEqual([
      "EN_CURSO",
      "OFERTA_FIRME",
      "RESERVA",
      "ARRAS",
      "PENDIENTE_FIRMA",
    ]);
  });
});

describe("stageIndex", () => {
  it("returns correct index for each stage", () => {
    expect(stageIndex("EN_CURSO")).toBe(0);
    expect(stageIndex("OFERTA_FIRME")).toBe(1);
    expect(stageIndex("RESERVA")).toBe(2);
    expect(stageIndex("ARRAS")).toBe(3);
    expect(stageIndex("PENDIENTE_FIRMA")).toBe(4);
  });

  it("returns -1 for terminal states", () => {
    expect(stageIndex("CERRADA_VENTA")).toBe(-1);
    expect(stageIndex("CERRADA_ALQUILER")).toBe(-1);
    expect(stageIndex("CANCELADA")).toBe(-1);
  });
});

describe("isAdvance", () => {
  it("returns true for forward transitions", () => {
    expect(isAdvance("EN_CURSO", "OFERTA_FIRME")).toBe(true);
    expect(isAdvance("EN_CURSO", "ARRAS")).toBe(true);
    expect(isAdvance("OFERTA_FIRME", "PENDIENTE_FIRMA")).toBe(true);
    expect(isAdvance("RESERVA", "ARRAS")).toBe(true);
  });

  it("returns false for same state", () => {
    expect(isAdvance("ARRAS", "ARRAS")).toBe(false);
  });

  it("returns false for backward transitions", () => {
    expect(isAdvance("ARRAS", "EN_CURSO")).toBe(false);
    expect(isAdvance("PENDIENTE_FIRMA", "RESERVA")).toBe(false);
  });

  it("returns false when either is a terminal state", () => {
    expect(isAdvance("ARRAS", "CERRADA_VENTA")).toBe(false);
    expect(isAdvance("CERRADA_VENTA", "EN_CURSO")).toBe(false);
  });
});

describe("skippedStages", () => {
  it("returns empty for adjacent stages", () => {
    expect(skippedStages("EN_CURSO", "OFERTA_FIRME")).toEqual([]);
    expect(skippedStages("OFERTA_FIRME", "RESERVA")).toEqual([]);
  });

  it("returns intermediate stages when skipping", () => {
    expect(skippedStages("EN_CURSO", "ARRAS")).toEqual([
      "OFERTA_FIRME",
      "RESERVA",
    ]);
  });

  it("returns all intermediates for EN_CURSO → PENDIENTE_FIRMA", () => {
    expect(skippedStages("EN_CURSO", "PENDIENTE_FIRMA")).toEqual([
      "OFERTA_FIRME",
      "RESERVA",
      "ARRAS",
    ]);
  });

  it("returns empty for backward transitions", () => {
    expect(skippedStages("ARRAS", "EN_CURSO")).toEqual([]);
  });

  it("returns empty when either is terminal", () => {
    expect(skippedStages("EN_CURSO", "CERRADA_VENTA")).toEqual([]);
  });
});

describe("isClosedEstado", () => {
  it("returns true for closed states", () => {
    for (const s of CLOSED_ESTADOS) {
      expect(isClosedEstado(s)).toBe(true);
    }
  });

  it("returns false for non-closed states", () => {
    expect(isClosedEstado("EN_CURSO")).toBe(false);
    expect(isClosedEstado("ARRAS")).toBe(false);
    expect(isClosedEstado("CANCELADA")).toBe(false);
  });
});

describe("isCancelado", () => {
  it("returns true only for CANCELADA", () => {
    expect(isCancelado("CANCELADA")).toBe(true);
    expect(isCancelado("CERRADA_VENTA")).toBe(false);
    expect(isCancelado("EN_CURSO")).toBe(false);
  });
});

describe("isTerminal", () => {
  it("returns true for all closed + CANCELADA", () => {
    expect(isTerminal("CERRADA_VENTA")).toBe(true);
    expect(isTerminal("CERRADA_ALQUILER")).toBe(true);
    expect(isTerminal("CERRADA_TRASPASO")).toBe(true);
    expect(isTerminal("CANCELADA")).toBe(true);
  });

  it("returns false for active stages", () => {
    for (const s of OPERACION_STAGE_ORDER) {
      expect(isTerminal(s)).toBe(false);
    }
  });
});

describe("documentKindForStage", () => {
  it("maps OFERTA_FIRME → oferta_firme", () => {
    expect(documentKindForStage("OFERTA_FIRME")).toBe("oferta_firme");
  });

  it("maps RESERVA → senal_compra", () => {
    expect(documentKindForStage("RESERVA")).toBe("senal_compra");
  });

  it("maps ARRAS → arras", () => {
    expect(documentKindForStage("ARRAS")).toBe("arras");
  });

  it("returns null for stages without document", () => {
    expect(documentKindForStage("EN_CURSO")).toBeNull();
    expect(documentKindForStage("PENDIENTE_FIRMA")).toBeNull();
    expect(documentKindForStage("CERRADA_VENTA")).toBeNull();
  });

  it("STAGE_DOCUMENT_KIND has exactly 3 entries", () => {
    expect(Object.keys(STAGE_DOCUMENT_KIND)).toHaveLength(3);
  });
});
