import { beforeEach, describe, expect, it } from "vitest";
import type { EventRecord } from "@/lib/event-store/types";
import type { EventType } from "@/app/generated/prisma/client";
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
      "SLA_INICIADO",
      "MATCH_GENERADO",
      "DEMANDA_ACTUALIZADA",
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
  const propertyEventTypes: EventType[] = [
    "PROPIEDAD_CREADA",
    "PROPIEDAD_MODIFICADA",
    "ESTADO_CAMBIADO",
  ];

  for (const eventType of propertyEventTypes) {
    it(`${eventType}: debe retornar success con follow-up UPDATE_PROPERTY_PROJECTION`, async () => {
      const handler = getHandler(eventType)!;
      expect(handler).toBeDefined();

      const event = makeEvent(eventType);
      const result = await handler(event);

      expect(result.success).toBe(true);
      expect(result.followUpJobs).toHaveLength(1);
      expect(result.followUpJobs![0].type).toBe("UPDATE_PROPERTY_PROJECTION");
      expect(result.followUpJobs![0].sourceEventId).toBe(event.id);
      expect(result.followUpJobs![0].idempotencyKey).toBe(
        `update_property_projection:${event.id}`,
      );
    });
  }
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

describe("placeholder handlers", () => {
  const placeholderTypes: EventType[] = [
    "LEAD_INGESTADO",
    "SLA_INICIADO",
    "MATCH_GENERADO",
    "DEMANDA_ACTUALIZADA",
  ];

  for (const eventType of placeholderTypes) {
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
