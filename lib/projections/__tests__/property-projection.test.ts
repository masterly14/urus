import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventRecord } from "@/lib/event-store/types";

const { upsertMock } = vi.hoisted(() => ({
  upsertMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    propertyCurrent: {
      upsert: upsertMock,
    },
  },
}));

import { applyPropertyProjection } from "../property-projection";

function makeEvent(
  type: string,
  payload: unknown,
  overrides: Partial<EventRecord> = {},
): EventRecord {
  return {
    id: "evt-prop-001",
    position: BigInt(10),
    type: type as EventRecord["type"],
    aggregateType: "PROPERTY",
    aggregateId: "prop-123",
    version: null,
    payload: payload as EventRecord["payload"],
    metadata: null,
    correlationId: null,
    causationId: null,
    occurredAt: new Date("2026-03-14T10:00:00Z"),
    createdAt: new Date("2026-03-14T10:00:00Z"),
    ...overrides,
  };
}

const FULL_SNAPSHOT = {
  codigo: "prop-123",
  ref: "REF-123",
  titulo: "Piso centro",
  tipoOfer: "Piso",
  precio: 150000,
  metrosConstruidos: 90,
  habitaciones: 3,
  banyos: 2,
  ciudad: "Córdoba",
  zona: "Centro",
  estado: "Activo",
  fechaAlta: "2026-01-01",
  fechaActualizacion: "2026-03-14",
  numFotos: 8,
  agente: "Comercial A",
};

describe("applyPropertyProjection", () => {
  beforeEach(() => {
    upsertMock.mockReset();
    upsertMock.mockResolvedValue({});
  });

  it("PROPIEDAD_CREADA: debe hacer upsert con snapshot completo", async () => {
    const event = makeEvent("PROPIEDAD_CREADA", {
      snapshot: FULL_SNAPSHOT,
      detectedAt: "2026-03-14T10:00:00Z",
    });

    const result = await applyPropertyProjection(event);

    expect(result.success).toBe(true);
    expect(result.aggregateId).toBe("prop-123");
    expect(upsertMock).toHaveBeenCalledTimes(1);

    const call = upsertMock.mock.calls[0][0];
    expect(call.where.codigo).toBe("prop-123");
    expect(call.create.codigo).toBe("prop-123");
    expect(call.create.precio).toBe(150000);
    expect(call.create.ciudad).toBe("Córdoba");
    expect(call.create.lastEventId).toBe("evt-prop-001");
    expect(call.update.precio).toBe(150000);
  });

  it("PROPIEDAD_MODIFICADA: debe actualizar solo los campos del after", async () => {
    const event = makeEvent("PROPIEDAD_MODIFICADA", {
      before: { precio: 150000, metrosConstruidos: 90, habitaciones: 3, banyos: 2, ciudad: "Córdoba", zona: "Centro", estado: "Activo", fechaActualizacion: "2026-03-10" },
      after: { precio: 140000, metrosConstruidos: 90, habitaciones: 3, banyos: 2, ciudad: "Córdoba", zona: "Centro", estado: "Activo", fechaActualizacion: "2026-03-14" },
      changedFields: ["precio"],
      detectedAt: "2026-03-14T10:00:00Z",
    });

    const result = await applyPropertyProjection(event);

    expect(result.success).toBe(true);
    expect(upsertMock).toHaveBeenCalledTimes(1);

    const call = upsertMock.mock.calls[0][0];
    expect(call.update.precio).toBe(140000);
    expect(call.update.lastEventId).toBe("evt-prop-001");
  });

  it("ESTADO_CAMBIADO: debe hacer upsert con snapshot completo", async () => {
    const event = makeEvent("ESTADO_CAMBIADO", {
      previousEstado: "Activo",
      newEstado: "Reservado",
      otherChangedFields: [],
      snapshot: { ...FULL_SNAPSHOT, estado: "Reservado" },
      detectedAt: "2026-03-14T10:00:00Z",
    });

    const result = await applyPropertyProjection(event);

    expect(result.success).toBe(true);
    expect(upsertMock).toHaveBeenCalledTimes(1);

    const call = upsertMock.mock.calls[0][0];
    expect(call.update.estado).toBe("Reservado");
  });

  it("debe fallar si PROPIEDAD_CREADA no tiene snapshot", async () => {
    const event = makeEvent("PROPIEDAD_CREADA", { detectedAt: "2026-03-14" });

    const result = await applyPropertyProjection(event);

    expect(result.success).toBe(false);
    expect(result.error).toContain("snapshot");
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("debe fallar si PROPIEDAD_MODIFICADA no tiene after", async () => {
    const event = makeEvent("PROPIEDAD_MODIFICADA", { detectedAt: "2026-03-14" });

    const result = await applyPropertyProjection(event);

    expect(result.success).toBe(false);
    expect(result.error).toContain("after");
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("tipo desconocido: debe retornar success sin upsert", async () => {
    const event = makeEvent("TIPO_INEXISTENTE", {});

    const result = await applyPropertyProjection(event);

    expect(result.success).toBe(true);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
