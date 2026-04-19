import { beforeEach, describe, expect, it } from "vitest";
import type { EventRecord } from "@/lib/event-store/types";
import type { EventType } from "@prisma/client";
import { getHandler, getRegisteredTypes } from "../handlers";

function makeEvent(
  type: EventType,
  overrides: Partial<EventRecord> = {},
): EventRecord {
  return {
    id: "evt-test-001",
    position: BigInt(1),
    type,
    aggregateType: "PROPERTY",
    aggregateId: "prop-123",
    version: null,
    payload: { snapshot: {} },
    metadata: null,
    correlationId: null,
    causationId: null,
    occurredAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

describe("handler registry", () => {
  it("debe tener handlers registrados para todos los EventType conocidos", () => {
    const registered = getRegisteredTypes();
    const expectedTypes: EventType[] = [
      "PROPIEDAD_CREADA",
      "PROPIEDAD_MODIFICADA",
      "ESTADO_CAMBIADO",
      "DEMANDA_CREADA",
      "DEMANDA_MODIFICADA",
      "DEMANDA_ESTADO_CAMBIADO",
      "LEAD_INGESTADO",
      "LEAD_SCORED",
      "SLA_INICIADO",
      "MATCH_GENERADO",
      "DEMANDA_ACTUALIZADA",
      "SELECCION_COMPRADOR",
      "SELECCION_VALIDADA",
      "SELECCION_RECHAZADA",
      "SELECCION_MICROSITE_DESCRIPCIONES_EDITADAS",
      "OPERACION_CERRADA",
    ];

    for (const type of expectedTypes) {
      expect(registered).toContain(type);
    }
  });

  it("debe retornar undefined para un tipo no registrado", () => {
    const handler = getHandler("NO_EXISTE" as EventType);
    expect(handler).toBeUndefined();
  });
});

describe("property handlers", () => {
  it("PROPIEDAD_CREADA: retorna success con follow-ups de projection + pricing", async () => {
    const handler = getHandler("PROPIEDAD_CREADA")!;
    expect(handler).toBeDefined();

    const event = makeEvent("PROPIEDAD_CREADA");
    const result = await handler(event);

    expect(result.success).toBe(true);
    expect(result.followUpJobs!.length).toBeGreaterThanOrEqual(2);
    const types = result.followUpJobs!.map((j) => j.type);
    expect(types).toContain("UPDATE_PROPERTY_PROJECTION");
    expect(types).toContain("RUN_PRICING_ANALYSIS");
  });

  it("PROPIEDAD_MODIFICADA: retorna success con follow-ups de projection + pricing", async () => {
    const handler = getHandler("PROPIEDAD_MODIFICADA")!;
    expect(handler).toBeDefined();

    const event = makeEvent("PROPIEDAD_MODIFICADA");
    const result = await handler(event);

    expect(result.success).toBe(true);
    expect(result.followUpJobs!.length).toBeGreaterThanOrEqual(2);
    const types = result.followUpJobs!.map((j) => j.type);
    expect(types).toContain("UPDATE_PROPERTY_PROJECTION");
    expect(types).toContain("RUN_PRICING_ANALYSIS");
  });

  it("ESTADO_CAMBIADO: retorna success con follow-up UPDATE_PROPERTY_PROJECTION", async () => {
    const handler = getHandler("ESTADO_CAMBIADO")!;
    expect(handler).toBeDefined();

    const event = makeEvent("ESTADO_CAMBIADO");
    const result = await handler(event);

    expect(result.success).toBe(true);
    expect(result.followUpJobs!.length).toBeGreaterThanOrEqual(1);
    const types = result.followUpJobs!.map((j) => j.type);
    expect(types).toContain("UPDATE_PROPERTY_PROJECTION");
  });
});

describe("demand handlers", () => {
  const demandEventTypes: EventType[] = [
    "DEMANDA_CREADA",
    "DEMANDA_MODIFICADA",
    "DEMANDA_ESTADO_CAMBIADO",
  ];

  for (const eventType of demandEventTypes) {
    it(`${eventType}: debe retornar success con follow-up UPDATE_DEMAND_PROJECTION`, async () => {
      const handler = getHandler(eventType)!;
      expect(handler).toBeDefined();

      const event = makeEvent(eventType, {
        aggregateType: "DEMAND",
        aggregateId: "dem-456",
      });
      const result = await handler(event);

      expect(result.success).toBe(true);
      expect(result.followUpJobs).toHaveLength(1);
      expect(result.followUpJobs![0].type).toBe("UPDATE_DEMAND_PROJECTION");
      expect(result.followUpJobs![0].sourceEventId).toBe(event.id);
      expect(result.followUpJobs![0].idempotencyKey).toBe(
        `update_demand_projection:${event.id}`,
      );
    });
  }
});

describe("audit-only handlers", () => {
  const auditOnlyTypes: EventType[] = [
    "LEAD_SCORED",
    "SLA_INICIADO",
    "SELECCION_VALIDADA",
    "SELECCION_RECHAZADA",
    "SELECCION_MICROSITE_DESCRIPCIONES_EDITADAS",
  ];

  for (const eventType of auditOnlyTypes) {
    it(`${eventType}: debe retornar success sin follow-up jobs`, async () => {
      const handler = getHandler(eventType)!;
      expect(handler).toBeDefined();

      const event = makeEvent(eventType);
      const result = await handler(event);

      expect(result.success).toBe(true);
      expect(result.followUpJobs).toBeUndefined();
    });
  }
});

describe("OPERACION_CERRADA handler", () => {
  it("es audit-only tras deprecar post-sale legacy (cadencia canónica: START_POSTVENTA_CADENCE desde smart-closing)", async () => {
    const handler = getHandler("OPERACION_CERRADA")!;
    expect(handler).toBeDefined();

    const event = makeEvent("OPERACION_CERRADA", {
      aggregateType: "OPERACION",
      aggregateId: "PROP-100",
      payload: {
        propertyCode: "PROP-100",
        newEstado: "Vendida",
        previousEstado: "Reservada",
        closedAt: new Date().toISOString(),
        sourceEstadoCambiadoEventId: "evt-src-001",
      },
    });

    const result = await handler(event);

    expect(result.success).toBe(true);
    expect(result.followUpJobs).toBeUndefined();
  });

  it("retorna success sin jobs si el payload es inválido", async () => {
    const handler = getHandler("OPERACION_CERRADA")!;
    const event = makeEvent("OPERACION_CERRADA", {
      payload: { invalid: true },
    });

    const result = await handler(event);

    expect(result.success).toBe(true);
    expect(result.followUpJobs).toBeUndefined();
  });

  it.skip("(deprecated) propaga demandId en el payload para actualizar leadStatus", async () => {
    const handler = getHandler("OPERACION_CERRADA")!;
    const event = makeEvent("OPERACION_CERRADA", {
      aggregateType: "OPERACION",
      aggregateId: "PROP-DEM",
      payload: {
        propertyCode: "PROP-DEM",
        newEstado: "Vendida",
        previousEstado: "Reservada",
        closedAt: new Date().toISOString(),
        operacionId: "cuid-op-123",
        demandId: "DEM-999",
      },
    });

    const result = await handler(event);

    expect(result.success).toBe(true);
    expect(result.followUpJobs).toHaveLength(5);
    for (const job of result.followUpJobs!) {
      expect(job.idempotencyKey).toMatch(/^post_sale:cuid-op-123:/);
    }
  });
});
