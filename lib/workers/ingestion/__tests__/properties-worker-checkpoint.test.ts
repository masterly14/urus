import { describe, expect, it } from "vitest";
import type { InmovillaProperty } from "@/lib/inmovilla/api/types";
import { resolveCheckpointResume } from "../properties-worker";

function property(codigo: string): InmovillaProperty {
  return {
    codigo,
    ref: `REF-${codigo}`,
    titulo: `Propiedad ${codigo}`,
    tipoOfer: "Piso",
    precio: 100_000,
    metrosConstruidos: 80,
    habitaciones: 2,
    banyos: 1,
    ciudad: "Cordoba",
    zona: "Centro",
    estado: "Libre",
    nodisponible: false,
    prospecto: false,
    fechaAlta: "2026-05-01 10:00:00",
    fechaActualizacion: "2026-05-24 10:00:00",
    numFotos: 5,
    agente: "Comercial",
    raw: {},
  };
}

describe("resolveCheckpointResume", () => {
  it("conserva fichas ya procesadas para construir un diff completo al terminar el checkpoint", () => {
    const result = resolveCheckpointResume(["A", "B", "C"], {
      pendingCodes: ["C"],
      completedProperties: [property("A"), property("B"), property("STALE")],
    });

    expect(result.toFetch).toEqual(["C"]);
    expect(result.completedProperties.map((p) => p.codigo)).toEqual(["A", "B"]);
  });

  it("ignora checkpoints obsoletos para evitar mezclar catálogos incompatibles", () => {
    const result = resolveCheckpointResume(["A", "B"], {
      pendingCodes: ["STALE"],
      completedProperties: [property("C")],
    });

    expect(result.toFetch).toEqual(["A", "B"]);
    expect(result.completedProperties).toEqual([]);
  });
});
