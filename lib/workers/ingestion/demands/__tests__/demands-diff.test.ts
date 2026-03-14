import { describe, expect, it } from "vitest";
import type { InmovillaDemand } from "@/lib/inmovilla/api/types-demands";
import type { DemandSnapshotData } from "../types";
import type { DemandSnapshotMap } from "../snapshot-repo";
import { computeDemandDiff } from "../demands-diff";

function makeDemand(
  overrides: Partial<InmovillaDemand> = {},
): InmovillaDemand {
  return {
    codigo: "D-001",
    ref: "REF-D-001",
    nombre: "Demanda ejemplo",
    estadoId: "20",
    estadoNombre: "Buscando",
    presupuestoMin: 150000,
    presupuestoMax: 250000,
    habitacionesMin: 2,
    tipos: "Piso",
    zonas: "Centro",
    fechaActualizacion: "2026-03-11 09:00:00",
    agente: "Agente",
    raw: {},
    ...overrides,
  };
}

function makeSnapshot(
  overrides: Partial<DemandSnapshotData> = {},
): DemandSnapshotData {
  return {
    codigo: "D-001",
    ref: "REF-D-001",
    nombre: "Demanda ejemplo",
    estadoId: "20",
    estadoNombre: "Buscando",
    presupuestoMin: 150000,
    presupuestoMax: 250000,
    habitacionesMin: 2,
    tipos: "Piso",
    zonas: "Centro",
    fechaActualizacion: "2026-03-11 09:00:00",
    agente: "Agente",
    ...overrides,
  };
}

function toSnapshotMap(items: DemandSnapshotData[]): DemandSnapshotMap {
  return new Map(items.map((item) => [item.codigo, item]));
}

describe("computeDemandDiff", () => {
  it("detecta demanda creada", () => {
    const result = computeDemandDiff([makeDemand({ codigo: "NEW-1" })], new Map());
    expect(result.created).toHaveLength(1);
    expect(result.modified).toHaveLength(0);
    expect(result.statusChanged).toHaveLength(0);
  });

  it("detecta demanda modificada sin cambio de estado", () => {
    const prev = makeSnapshot({ presupuestoMax: 250000 });
    const curr = makeDemand({ presupuestoMax: 280000 });
    const result = computeDemandDiff([curr], toSnapshotMap([prev]));
    expect(result.modified).toHaveLength(1);
    expect(result.modified[0].changedFields).toContain("presupuestoMax");
    expect(result.statusChanged).toHaveLength(0);
  });

  it("detecta cambio de estado de demanda", () => {
    const prev = makeSnapshot({ estadoId: "20", estadoNombre: "Buscando" });
    const curr = makeDemand({ estadoId: "31", estadoNombre: "Parada" });
    const result = computeDemandDiff([curr], toSnapshotMap([prev]));
    expect(result.statusChanged).toHaveLength(1);
    expect(result.statusChanged[0].previousEstadoId).toBe("20");
    expect(result.statusChanged[0].newEstadoId).toBe("31");
  });

  it("detecta sin cambios", () => {
    const prev = makeSnapshot();
    const curr = makeDemand();
    const result = computeDemandDiff([curr], toSnapshotMap([prev]));
    expect(result.unchanged).toBe(1);
    expect(result.created).toHaveLength(0);
    expect(result.modified).toHaveLength(0);
    expect(result.statusChanged).toHaveLength(0);
  });
});
