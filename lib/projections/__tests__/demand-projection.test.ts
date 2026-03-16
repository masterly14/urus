import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventRecord } from "@/lib/event-store/types";

const { upsertMock } = vi.hoisted(() => ({
  upsertMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    demandCurrent: {
      upsert: upsertMock,
    },
  },
}));

import { applyDemandProjection } from "../demand-projection";

function makeEvent(
  type: string,
  payload: unknown,
  overrides: Partial<EventRecord> = {},
): EventRecord {
  return {
    id: "evt-dem-001",
    position: BigInt(20),
    type: type as EventRecord["type"],
    aggregateType: "DEMAND",
    aggregateId: "dem-456",
    version: null,
    payload: payload as EventRecord["payload"],
    metadata: null,
    correlationId: null,
    causationId: null,
    occurredAt: new Date("2026-03-14T11:00:00Z"),
    createdAt: new Date("2026-03-14T11:00:00Z"),
    ...overrides,
  };
}

const FULL_SNAPSHOT = {
  codigo: "dem-456",
  ref: "REF-456",
  nombre: "Demanda test",
  estadoId: "20",
  estadoNombre: "Buscando",
  presupuestoMin: 100000,
  presupuestoMax: 200000,
  habitacionesMin: 2,
  tipos: "Piso",
  zonas: "Centro",
  fechaActualizacion: "2026-03-14",
  agente: "Agente B",
};

describe("applyDemandProjection", () => {
  beforeEach(() => {
    upsertMock.mockReset();
    upsertMock.mockResolvedValue({});
  });

  it("DEMANDA_CREADA: debe hacer upsert con snapshot completo", async () => {
    const event = makeEvent("DEMANDA_CREADA", {
      snapshot: FULL_SNAPSHOT,
      detectedAt: "2026-03-14T11:00:00Z",
    });

    const result = await applyDemandProjection(event);

    expect(result.success).toBe(true);
    expect(result.aggregateId).toBe("dem-456");
    expect(upsertMock).toHaveBeenCalledTimes(1);

    const call = upsertMock.mock.calls[0][0];
    expect(call.where.codigo).toBe("dem-456");
    expect(call.create.codigo).toBe("dem-456");
    expect(call.create.presupuestoMax).toBe(200000);
    expect(call.create.estadoNombre).toBe("Buscando");
    expect(call.create.lastEventId).toBe("evt-dem-001");
  });

  it("DEMANDA_MODIFICADA: debe actualizar campos del after", async () => {
    const event = makeEvent("DEMANDA_MODIFICADA", {
      before: { estadoId: "20", estadoNombre: "Buscando", presupuestoMin: 100000, presupuestoMax: 200000, habitacionesMin: 2, tipos: "Piso", zonas: "Centro", fechaActualizacion: "2026-03-10" },
      after: { estadoId: "20", estadoNombre: "Buscando", presupuestoMin: 100000, presupuestoMax: 250000, habitacionesMin: 2, tipos: "Piso", zonas: "Centro", fechaActualizacion: "2026-03-14" },
      changedFields: ["presupuestoMax"],
      detectedAt: "2026-03-14T11:00:00Z",
    });

    const result = await applyDemandProjection(event);

    expect(result.success).toBe(true);
    expect(upsertMock).toHaveBeenCalledTimes(1);

    const call = upsertMock.mock.calls[0][0];
    expect(call.update.presupuestoMax).toBe(250000);
    expect(call.update.lastEventId).toBe("evt-dem-001");
  });

  it("DEMANDA_ESTADO_CAMBIADO: debe hacer upsert con snapshot completo", async () => {
    const event = makeEvent("DEMANDA_ESTADO_CAMBIADO", {
      previousEstadoId: "20",
      previousEstadoNombre: "Buscando",
      newEstadoId: "31",
      newEstadoNombre: "Parada",
      otherChangedFields: [],
      snapshot: { ...FULL_SNAPSHOT, estadoId: "31", estadoNombre: "Parada" },
      detectedAt: "2026-03-14T11:00:00Z",
    });

    const result = await applyDemandProjection(event);

    expect(result.success).toBe(true);
    expect(upsertMock).toHaveBeenCalledTimes(1);

    const call = upsertMock.mock.calls[0][0];
    expect(call.update.estadoId).toBe("31");
    expect(call.update.estadoNombre).toBe("Parada");
  });

  it("debe fallar si DEMANDA_CREADA no tiene snapshot", async () => {
    const event = makeEvent("DEMANDA_CREADA", { detectedAt: "2026-03-14" });

    const result = await applyDemandProjection(event);

    expect(result.success).toBe(false);
    expect(result.error).toContain("snapshot");
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("debe fallar si DEMANDA_MODIFICADA no tiene after", async () => {
    const event = makeEvent("DEMANDA_MODIFICADA", { detectedAt: "2026-03-14" });

    const result = await applyDemandProjection(event);

    expect(result.success).toBe(false);
    expect(result.error).toContain("after");
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("tipo desconocido: debe retornar success sin upsert", async () => {
    const event = makeEvent("TIPO_INEXISTENTE", {});

    const result = await applyDemandProjection(event);

    expect(result.success).toBe(true);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
