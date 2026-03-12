import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InmovillaProperty } from "@/lib/inmovilla/api/types";
import type { PropertyDiffResult } from "../types";
import { publishEventsForDiff } from "../event-publisher";

const { appendEventMock } = vi.hoisted(() => ({
  appendEventMock: vi.fn(),
}));

vi.mock("@/lib/event-store", () => ({
  appendEvent: appendEventMock,
}));

function makeProperty(
  codigo: string,
  overrides: Partial<InmovillaProperty> = {},
): InmovillaProperty {
  return {
    codigo,
    ref: `REF-${codigo}`,
    titulo: "Piso test",
    tipoOfer: "Piso",
    precio: 120_000,
    metrosConstruidos: 80,
    habitaciones: 3,
    banyos: 2,
    ciudad: "Madrid",
    zona: "Centro",
    estado: "Activo",
    fechaAlta: "2026-01-01 10:00:00",
    fechaActualizacion: "2026-03-11 10:00:00",
    numFotos: 6,
    agente: "Agent",
    raw: { any: "value" },
    ...overrides,
  };
}

describe("publishEventsForDiff", () => {
  beforeEach(() => {
    appendEventMock.mockReset();
    appendEventMock.mockResolvedValue({ id: "evt-1" });
  });

  it("debe publicar los 3 tipos de evento con correlationId y metadata", async () => {
    const diff: PropertyDiffResult = {
      created: [{ type: "created", property: makeProperty("C-1") }],
      modified: [
        {
          type: "modified",
          property: makeProperty("M-1", { precio: 140_000 }),
          before: {
            precio: 120_000,
            metrosConstruidos: 80,
            habitaciones: 3,
            banyos: 2,
            ciudad: "Madrid",
            zona: "Centro",
            estado: "Activo",
            fechaActualizacion: "2026-03-10 10:00:00",
          },
          changedFields: ["precio"],
        },
      ],
      statusChanged: [
        {
          type: "status_changed",
          property: makeProperty("S-1", { estado: "Reservado" }),
          previousEstado: "Activo",
          newEstado: "Reservado",
          otherChangedFields: [],
        },
      ],
      unchanged: 0,
    };

    const cycleId = "cycle-test-001";
    const result = await publishEventsForDiff(diff, cycleId);

    expect(result.emitted).toBe(3);
    expect(appendEventMock).toHaveBeenCalledTimes(3);

    const calls = appendEventMock.mock.calls.map((call) => call[0]);
    const types = calls.map((c) => c.type).sort();
    expect(types).toEqual([
      "ESTADO_CAMBIADO",
      "PROPIEDAD_CREADA",
      "PROPIEDAD_MODIFICADA",
    ]);

    for (const call of calls) {
      expect(call.aggregateType).toBe("PROPERTY");
      expect(call.correlationId).toBe(cycleId);
      expect(call.metadata?.source).toBe("ingestion:properties");
      expect(call.metadata?.cycleId).toBe(cycleId);
      expect(call.metadata?.fingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(call.metadata?.aggregateId).toBe(call.aggregateId);
    }
  });

  it("debe publicar en orden determinista por aggregateId", async () => {
    const diff: PropertyDiffResult = {
      created: [{ type: "created", property: makeProperty("B-2") }],
      modified: [
        {
          type: "modified",
          property: makeProperty("A-1", { precio: 130_000 }),
          before: {
            precio: 120_000,
            metrosConstruidos: 80,
            habitaciones: 3,
            banyos: 2,
            ciudad: "Madrid",
            zona: "Centro",
            estado: "Activo",
            fechaActualizacion: "2026-03-10 10:00:00",
          },
          changedFields: ["precio"],
        },
      ],
      statusChanged: [],
      unchanged: 0,
    };

    await publishEventsForDiff(diff, "cycle-test-002");

    const aggregateOrder = appendEventMock.mock.calls.map(
      (call) => call[0].aggregateId,
    );
    expect(aggregateOrder).toEqual(["A-1", "B-2"]);
  });
});
