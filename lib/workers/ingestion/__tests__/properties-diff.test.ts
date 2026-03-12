import { describe, it, expect } from "vitest";
import { computePropertyDiff } from "../properties-diff";
import type { InmovillaProperty } from "@/lib/inmovilla/api/types";
import type { PropertySnapshotData } from "../types";
import type { SnapshotMap } from "../snapshot-repo";

function makeProperty(overrides: Partial<InmovillaProperty> = {}): InmovillaProperty {
  return {
    codigo: "10001",
    ref: "REF-001",
    titulo: "Piso en centro",
    tipoOfer: "Piso",
    precio: 250_000,
    metrosConstruidos: 90,
    habitaciones: 3,
    banyos: 2,
    ciudad: "Madrid",
    zona: "Centro",
    estado: "Activo",
    fechaAlta: "2026-01-01 10:00:00",
    fechaActualizacion: "2026-03-01 12:00:00",
    numFotos: 10,
    agente: "Ana García",
    raw: {},
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<PropertySnapshotData> = {}): PropertySnapshotData {
  return {
    codigo: "10001",
    ref: "REF-001",
    titulo: "Piso en centro",
    tipoOfer: "Piso",
    precio: 250_000,
    metrosConstruidos: 90,
    habitaciones: 3,
    banyos: 2,
    ciudad: "Madrid",
    zona: "Centro",
    estado: "Activo",
    fechaAlta: "2026-01-01 10:00:00",
    fechaActualizacion: "2026-03-01 12:00:00",
    numFotos: 10,
    agente: "Ana García",
    ...overrides,
  };
}

function toSnapshotMap(snapshots: PropertySnapshotData[]): SnapshotMap {
  return new Map(snapshots.map((s) => [s.codigo, s]));
}

describe("computePropertyDiff", () => {
  it("debe detectar propiedad nueva (PROPIEDAD_CREADA)", () => {
    const current = [makeProperty({ codigo: "NEW-001" })];
    const previous = toSnapshotMap([]);

    const result = computePropertyDiff(current, previous);

    expect(result.created).toHaveLength(1);
    expect(result.created[0].property.codigo).toBe("NEW-001");
    expect(result.modified).toHaveLength(0);
    expect(result.statusChanged).toHaveLength(0);
    expect(result.unchanged).toBe(0);
  });

  it("debe detectar cambio de precio (PROPIEDAD_MODIFICADA)", () => {
    const prev = makeSnapshot({ codigo: "10001", precio: 250_000 });
    const curr = makeProperty({ codigo: "10001", precio: 275_000 });

    const result = computePropertyDiff([curr], toSnapshotMap([prev]));

    expect(result.created).toHaveLength(0);
    expect(result.modified).toHaveLength(1);
    expect(result.modified[0].changedFields).toContain("precio");
    expect(result.modified[0].before.precio).toBe(250_000);
    expect(result.statusChanged).toHaveLength(0);
  });

  it("debe detectar cambio de estado (ESTADO_CAMBIADO)", () => {
    const prev = makeSnapshot({ codigo: "10001", estado: "Activo" });
    const curr = makeProperty({ codigo: "10001", estado: "Vendido" });

    const result = computePropertyDiff([curr], toSnapshotMap([prev]));

    expect(result.created).toHaveLength(0);
    expect(result.modified).toHaveLength(0);
    expect(result.statusChanged).toHaveLength(1);
    expect(result.statusChanged[0].previousEstado).toBe("Activo");
    expect(result.statusChanged[0].newEstado).toBe("Vendido");
  });

  it("debe clasificar como ESTADO_CAMBIADO cuando cambia estado junto con otros campos", () => {
    const prev = makeSnapshot({
      codigo: "10001",
      estado: "Activo",
      precio: 250_000,
    });
    const curr = makeProperty({
      codigo: "10001",
      estado: "Reservado",
      precio: 240_000,
    });

    const result = computePropertyDiff([curr], toSnapshotMap([prev]));

    expect(result.statusChanged).toHaveLength(1);
    expect(result.statusChanged[0].otherChangedFields).toContain("precio");
    expect(result.modified).toHaveLength(0);
  });

  it("debe reportar sin cambios cuando no hay diferencias", () => {
    const prev = makeSnapshot();
    const curr = makeProperty();

    const result = computePropertyDiff([curr], toSnapshotMap([prev]));

    expect(result.created).toHaveLength(0);
    expect(result.modified).toHaveLength(0);
    expect(result.statusChanged).toHaveLength(0);
    expect(result.unchanged).toBe(1);
  });

  it("debe detectar múltiples cambios de campos (sin estado)", () => {
    const prev = makeSnapshot({
      codigo: "10001",
      precio: 250_000,
      ciudad: "Madrid",
      zona: "Centro",
    });
    const curr = makeProperty({
      codigo: "10001",
      precio: 275_000,
      ciudad: "Madrid",
      zona: "Salamanca",
    });

    const result = computePropertyDiff([curr], toSnapshotMap([prev]));

    expect(result.modified).toHaveLength(1);
    expect(result.modified[0].changedFields).toContain("precio");
    expect(result.modified[0].changedFields).toContain("zona");
    expect(result.modified[0].changedFields).not.toContain("ciudad");
  });

  it("debe manejar snapshot vacío correctamente (primera corrida)", () => {
    const properties = [
      makeProperty({ codigo: "A1" }),
      makeProperty({ codigo: "A2" }),
      makeProperty({ codigo: "A3" }),
    ];
    const previous = toSnapshotMap([]);

    const result = computePropertyDiff(properties, previous);

    expect(result.created).toHaveLength(3);
    expect(result.modified).toHaveLength(0);
    expect(result.statusChanged).toHaveLength(0);
    expect(result.unchanged).toBe(0);
  });

  it("debe manejar mezcla de nuevas, modificadas, cambio de estado y sin cambios", () => {
    const prev1 = makeSnapshot({ codigo: "P1" });
    const prev2 = makeSnapshot({ codigo: "P2", precio: 200_000 });
    const prev3 = makeSnapshot({ codigo: "P3", estado: "Activo" });

    const curr1 = makeProperty({ codigo: "P1" });
    const curr2 = makeProperty({ codigo: "P2", precio: 220_000 });
    const curr3 = makeProperty({ codigo: "P3", estado: "Vendido" });
    const curr4 = makeProperty({ codigo: "P4" });

    const result = computePropertyDiff(
      [curr1, curr2, curr3, curr4],
      toSnapshotMap([prev1, prev2, prev3]),
    );

    expect(result.unchanged).toBe(1);
    expect(result.modified).toHaveLength(1);
    expect(result.modified[0].property.codigo).toBe("P2");
    expect(result.statusChanged).toHaveLength(1);
    expect(result.statusChanged[0].property.codigo).toBe("P3");
    expect(result.created).toHaveLength(1);
    expect(result.created[0].property.codigo).toBe("P4");
  });

  it("no debe considerar campos fuera de DIFF_FIELDS como cambios", () => {
    const prev = makeSnapshot({ codigo: "10001" });
    const curr = makeProperty({
      codigo: "10001",
      titulo: "Título cambiado",
      agente: "Otro agente",
      numFotos: 99,
    });

    const result = computePropertyDiff([curr], toSnapshotMap([prev]));

    expect(result.unchanged).toBe(1);
    expect(result.modified).toHaveLength(0);
    expect(result.statusChanged).toHaveLength(0);
  });
});
