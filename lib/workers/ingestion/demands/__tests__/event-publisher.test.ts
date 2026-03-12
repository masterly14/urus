import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InmovillaDemand } from "@/lib/inmovilla/api/types-demands";
import type { DemandDiffResult } from "../types";
import { publishDemandEventsForDiff } from "../event-publisher";

const { appendEventMock } = vi.hoisted(() => ({
  appendEventMock: vi.fn(),
}));

vi.mock("@/lib/event-store", () => ({
  appendEvent: appendEventMock,
}));

function makeDemand(
  codigo: string,
  overrides: Partial<InmovillaDemand> = {},
): InmovillaDemand {
  return {
    codigo,
    ref: `REF-${codigo}`,
    nombre: "Demanda test",
    estadoId: "20",
    estadoNombre: "Buscando",
    presupuestoMin: 100000,
    presupuestoMax: 200000,
    habitacionesMin: 2,
    tipos: "Piso",
    zonas: "Centro",
    fechaActualizacion: "2026-03-11 10:00:00",
    agente: "Agente",
    raw: {},
    ...overrides,
  };
}

describe("publishDemandEventsForDiff", () => {
  beforeEach(() => {
    appendEventMock.mockReset();
    appendEventMock.mockResolvedValue({ id: "evt" });
  });

  it("publica eventos de demanda con correlationId y metadata", async () => {
    const diff: DemandDiffResult = {
      created: [{ type: "created", demand: makeDemand("C-1") }],
      modified: [
        {
          type: "modified",
          demand: makeDemand("M-1", { presupuestoMax: 220000 }),
          before: {
            estadoId: "20",
            estadoNombre: "Buscando",
            presupuestoMin: 100000,
            presupuestoMax: 200000,
            habitacionesMin: 2,
            tipos: "Piso",
            zonas: "Centro",
            fechaActualizacion: "2026-03-10 10:00:00",
          },
          changedFields: ["presupuestoMax"],
        },
      ],
      statusChanged: [
        {
          type: "status_changed",
          demand: makeDemand("S-1", { estadoId: "31", estadoNombre: "Parada" }),
          previousEstadoId: "20",
          previousEstadoNombre: "Buscando",
          newEstadoId: "31",
          newEstadoNombre: "Parada",
          otherChangedFields: [],
        },
      ],
      unchanged: 0,
    };

    const cycleId = "cycle-demand-test-1";
    const result = await publishDemandEventsForDiff(diff, cycleId);

    expect(result.emitted).toBe(3);
    expect(appendEventMock).toHaveBeenCalledTimes(3);

    const calls = appendEventMock.mock.calls.map((c) => c[0]);
    const types = calls.map((c) => c.type).sort();
    expect(types).toEqual([
      "DEMANDA_CREADA",
      "DEMANDA_ESTADO_CAMBIADO",
      "DEMANDA_MODIFICADA",
    ]);

    for (const call of calls) {
      expect(call.aggregateType).toBe("DEMAND");
      expect(call.correlationId).toBe(cycleId);
      expect(call.metadata?.source).toBe("ingestion:demands");
      expect(call.metadata?.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});
