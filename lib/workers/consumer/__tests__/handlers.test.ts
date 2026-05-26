import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventRecord } from "@/lib/event-store/types";
import type { EventType } from "@prisma/client";

const { mockApplyDemandProjectionInline } = vi.hoisted(() => ({
  mockApplyDemandProjectionInline: vi.fn(),
}));
const { mockUpsertCommercialOperationFact } = vi.hoisted(() => ({
  mockUpsertCommercialOperationFact: vi.fn(),
}));

vi.mock("@/lib/projections/projection-worker", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/projections/projection-worker")
  >();
  return {
    ...actual,
    applyDemandProjectionInline: (...args: unknown[]) =>
      mockApplyDemandProjectionInline(...args),
  };
});
vi.mock("@/lib/dashboard/comercial/facts", () => ({
  upsertCommercialOperationFactFromOperacionCerradaEvent: (
    ...args: unknown[]
  ) => mockUpsertCommercialOperationFact(...args),
}));

const { getHandler, getRegisteredTypes } = await import("../handlers");

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
      "DEMANDA_ELIMINADA",
      "LEAD_INGESTADO",
      "LEAD_SCORED",
      "SLA_INICIADO",
      "MATCH_GENERADO",
      "DEMANDA_ACTUALIZADA",
      "SELECCION_COMPRADOR",
      "SELECCION_VALIDADA",
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
  beforeEach(() => {
    mockApplyDemandProjectionInline.mockReset();
    mockApplyDemandProjectionInline.mockResolvedValue({
      success: true,
      aggregateId: "dem-456",
    });
  });

  it("DEMANDA_CREADA: aplica proyección inline y encola MATCH_DEMAND_AGAINST_INTERNAL + START_NLU_INITIAL_CONTACT (sin EVALUATE_DEMAND_COVERAGE directo)", async () => {
    const handler = getHandler("DEMANDA_CREADA")!;
    expect(handler).toBeDefined();

    const event = makeEvent("DEMANDA_CREADA", {
      aggregateType: "DEMAND",
      aggregateId: "dem-456",
    });
    const result = await handler(event);

    expect(mockApplyDemandProjectionInline).toHaveBeenCalledWith(event);
    expect(result.success).toBe(true);
    const types = result.followUpJobs!.map((j) => j.type);
    expect(types).not.toContain("UPDATE_DEMAND_PROJECTION");
    expect(types).not.toContain("EVALUATE_DEMAND_COVERAGE");
    expect(types).toContain("MATCH_DEMAND_AGAINST_INTERNAL");
    expect(types).toContain("START_NLU_INITIAL_CONTACT");

    const matchJob = result.followUpJobs!.find(
      (j) => j.type === "MATCH_DEMAND_AGAINST_INTERNAL",
    )!;
    expect(matchJob.sourceEventId).toBe(event.id);
    expect(matchJob.idempotencyKey).toBe(`match_internal:${event.id}`);
    const matchPayload = matchJob.payload as Record<string, unknown>;
    expect(matchPayload.demandId).toBe("dem-456");
    expect(matchPayload.source).toBe("auto_demand_creada");

    const nluJob = result.followUpJobs!.find(
      (j) => j.type === "START_NLU_INITIAL_CONTACT",
    )!;
    expect(nluJob.idempotencyKey).toBe(`nlu_initial_contact:${event.id}`);
    const nluPayload = nluJob.payload as Record<string, unknown>;
    expect(nluPayload.source).toBe("auto_demand_creada");
  });

  it("DEMANDA_CREADA: si la proyección inline falla, devuelve error y no encola jobs", async () => {
    mockApplyDemandProjectionInline.mockResolvedValueOnce({
      success: false,
      aggregateId: "dem-456",
      error: "boom",
    });

    const handler = getHandler("DEMANDA_CREADA")!;
    const event = makeEvent("DEMANDA_CREADA", {
      aggregateType: "DEMAND",
      aggregateId: "dem-456",
    });
    const result = await handler(event);

    expect(result.success).toBe(false);
    expect(result.error).toBe("boom");
    expect(result.followUpJobs).toBeUndefined();
  });

  it("DEMANDA_MODIFICADA con changedFields en MATCHING_RELEVANT_DEMAND_FIELDS: encola MATCH_DEMAND_AGAINST_INTERNAL", async () => {
    const handler = getHandler("DEMANDA_MODIFICADA")!;
    const event = makeEvent("DEMANDA_MODIFICADA", {
      aggregateType: "DEMAND",
      aggregateId: "dem-456",
      payload: {
        changedFields: ["presupuestoMax"],
        after: { telefono: "34600111222" },
      },
    });
    const result = await handler(event);

    expect(result.success).toBe(true);
    const types = result.followUpJobs!.map((j) => j.type);
    expect(types).toContain("MATCH_DEMAND_AGAINST_INTERNAL");
    // No se encola coverage directo cuando hay match: el match handler lo encadena
    expect(types).not.toContain("EVALUATE_DEMAND_COVERAGE");
    expect(types).not.toContain("START_NLU_INITIAL_CONTACT");

    const matchJob = result.followUpJobs!.find(
      (j) => j.type === "MATCH_DEMAND_AGAINST_INTERNAL",
    )!;
    const matchPayload = matchJob.payload as Record<string, unknown>;
    expect(matchPayload.source).toBe("auto_demand_modificada");
  });

  it("DEMANDA_MODIFICADA sin cambios en MATCHING_RELEVANT_DEMAND_FIELDS: encola solo EVALUATE_DEMAND_COVERAGE", async () => {
    const handler = getHandler("DEMANDA_MODIFICADA")!;
    const event = makeEvent("DEMANDA_MODIFICADA", {
      aggregateType: "DEMAND",
      aggregateId: "dem-456",
      payload: {
        changedFields: ["nombre"],
        after: { telefono: "" },
      },
    });
    const result = await handler(event);

    expect(result.success).toBe(true);
    const types = result.followUpJobs!.map((j) => j.type);
    expect(types).toContain("EVALUATE_DEMAND_COVERAGE");
    expect(types).not.toContain("MATCH_DEMAND_AGAINST_INTERNAL");
    expect(types).not.toContain("START_NLU_INITIAL_CONTACT");
  });

  it("DEMANDA_MODIFICADA con teléfono recién añadido y cambio en criterios: encola match + NLU", async () => {
    const handler = getHandler("DEMANDA_MODIFICADA")!;
    const event = makeEvent("DEMANDA_MODIFICADA", {
      aggregateType: "DEMAND",
      aggregateId: "dem-456",
      payload: {
        changedFields: ["presupuestoMax", "telefono"],
        after: { telefono: "34600111222" },
      },
    });
    const result = await handler(event);

    expect(result.success).toBe(true);
    const types = result.followUpJobs!.map((j) => j.type);
    expect(types).toContain("MATCH_DEMAND_AGAINST_INTERNAL");
    expect(types).toContain("START_NLU_INITIAL_CONTACT");
    expect(types).not.toContain("EVALUATE_DEMAND_COVERAGE");

    const nluJob = result.followUpJobs!.find(
      (j) => j.type === "START_NLU_INITIAL_CONTACT",
    )!;
    expect((nluJob.payload as Record<string, unknown>).source).toBe(
      "auto_demand_modificada_phone",
    );
  });

  it("DEMANDA_MODIFICADA con teléfono recién añadido pero sin cambio en criterios: encola coverage + NLU", async () => {
    const handler = getHandler("DEMANDA_MODIFICADA")!;
    const event = makeEvent("DEMANDA_MODIFICADA", {
      aggregateType: "DEMAND",
      aggregateId: "dem-456",
      payload: {
        changedFields: ["telefono"],
        after: { telefono: "34600111222" },
      },
    });
    const result = await handler(event);

    expect(result.success).toBe(true);
    const types = result.followUpJobs!.map((j) => j.type);
    expect(types).toContain("EVALUATE_DEMAND_COVERAGE");
    expect(types).toContain("START_NLU_INITIAL_CONTACT");
    expect(types).not.toContain("MATCH_DEMAND_AGAINST_INTERNAL");
  });

  it("DEMANDA_MODIFICADA con changedFields=['telefono'] pero after.telefono vacío: no encola NLU", async () => {
    const handler = getHandler("DEMANDA_MODIFICADA")!;
    const event = makeEvent("DEMANDA_MODIFICADA", {
      aggregateType: "DEMAND",
      aggregateId: "dem-456",
      payload: {
        changedFields: ["telefono"],
        after: { telefono: "" },
      },
    });
    const result = await handler(event);

    const types = result.followUpJobs!.map((j) => j.type);
    expect(types).not.toContain("START_NLU_INITIAL_CONTACT");
  });

  it("DEMANDA_ESTADO_CAMBIADO: aplica proyección inline y encola solo EVALUATE_DEMAND_COVERAGE", async () => {
    const handler = getHandler("DEMANDA_ESTADO_CAMBIADO")!;
    const event = makeEvent("DEMANDA_ESTADO_CAMBIADO", {
      aggregateType: "DEMAND",
      aggregateId: "dem-456",
    });
    const result = await handler(event);

    expect(mockApplyDemandProjectionInline).toHaveBeenCalledWith(event);
    expect(result.success).toBe(true);
    const types = result.followUpJobs!.map((j) => j.type);
    expect(types).toEqual(["EVALUATE_DEMAND_COVERAGE"]);
  });

  it("DEMANDA_ELIMINADA: aplica proyección inline y no encola ningún follow-up", async () => {
    const handler = getHandler("DEMANDA_ELIMINADA")!;
    expect(handler).toBeDefined();

    const event = makeEvent("DEMANDA_ELIMINADA", {
      aggregateType: "DEMAND",
      aggregateId: "dem-456",
    });
    const result = await handler(event);

    expect(mockApplyDemandProjectionInline).toHaveBeenCalledWith(event);
    expect(result.success).toBe(true);
    expect(result.followUpJobs).toEqual([]);
  });
});

describe("audit-only handlers", () => {
  const auditOnlyTypes: EventType[] = [
    "LEAD_SCORED",
    "SLA_INICIADO",
    "SELECCION_VALIDADA",
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
  beforeEach(() => {
    mockUpsertCommercialOperationFact.mockReset();
    mockUpsertCommercialOperationFact.mockResolvedValue(undefined);
  });

  it("materializa CommercialOperationFact y no encola jobs", async () => {
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

    expect(mockUpsertCommercialOperationFact).toHaveBeenCalledWith(event);
    expect(result.success).toBe(true);
    expect(result.followUpJobs).toBeUndefined();
  });

  it("materializa CommercialOperationFact para cierres manuales de Operaciones v2", async () => {
    const handler = getHandler("OPERACION_CERRADA")!;
    const event = makeEvent("OPERACION_CERRADA", {
      aggregateType: "OPERACION",
      aggregateId: "PROP-300",
      payload: {
        propertyCode: "PROP-300",
        newEstado: "CERRADA_VENTA",
        previousEstado: "ARRAS",
        closedAt: new Date().toISOString(),
        operacionId: "op-300",
        comercialId: "com-300",
        source: "manual_close",
      },
    });

    const result = await handler(event);

    expect(mockUpsertCommercialOperationFact).toHaveBeenCalledWith(event);
    expect(result.success).toBe(true);
    expect(result.followUpJobs).toBeUndefined();
  });

  it("retorna success sin jobs y omite upsert si newEstado no representa cierre", async () => {
    mockUpsertCommercialOperationFact.mockRejectedValueOnce(
      new Error("db down"),
    );

    const handler = getHandler("OPERACION_CERRADA")!;
    const event = makeEvent("OPERACION_CERRADA", {
      payload: { invalid: true },
    });

    const result = await handler(event);

    expect(mockUpsertCommercialOperationFact).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.followUpJobs).toBeUndefined();
  });

  it("retorna success sin jobs aunque falle el upsert en un cierre válido", async () => {
    mockUpsertCommercialOperationFact.mockRejectedValueOnce(
      new Error("db down"),
    );

    const handler = getHandler("OPERACION_CERRADA")!;
    const event = makeEvent("OPERACION_CERRADA", {
      payload: {
        propertyCode: "PROP-200",
        newEstado: "Vendida",
        previousEstado: "Reservada",
        closedAt: new Date().toISOString(),
      },
    });

    const result = await handler(event);

    expect(mockUpsertCommercialOperationFact).toHaveBeenCalledWith(event);
    expect(result.success).toBe(true);
    expect(result.followUpJobs).toBeUndefined();
  });
});
