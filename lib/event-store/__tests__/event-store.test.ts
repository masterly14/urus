import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  appendEvent,
  getEventsByAggregate,
  getEventsSince,
} from "../event-store";
import type { AppendEventInput } from "../types";

const TEST_CORRELATION_ID = `test-run-${Date.now()}`;

function buildInput(
  overrides?: Partial<AppendEventInput>,
): AppendEventInput {
  return {
    type: "PROPIEDAD_CREADA",
    aggregateType: "PROPERTY",
    aggregateId: `test-prop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    payload: { source: "test" },
    correlationId: TEST_CORRELATION_ID,
    ...overrides,
  };
}

beforeEach(async () => {
  await prisma.event.deleteMany({
    where: { correlationId: TEST_CORRELATION_ID },
  });
});

afterAll(async () => {
  await prisma.event.deleteMany({
    where: { correlationId: TEST_CORRELATION_ID },
  });
  await prisma.$disconnect();
});

describe("appendEvent", () => {
  it("debe crear un evento y devolver id, position y occurredAt", async () => {
    const input = buildInput();
    const event = await appendEvent(input);

    expect(event.id).toBeDefined();
    expect(typeof event.position).toBe("bigint");
    expect(event.occurredAt).toBeInstanceOf(Date);
    expect(event.type).toBe("PROPIEDAD_CREADA");
    expect(event.aggregateType).toBe("PROPERTY");
    expect(event.aggregateId).toBe(input.aggregateId);
  });

  it("debe almacenar el payload correctamente", async () => {
    const payload = { precio: 350000, zona: "centro", metros: 120 };
    const event = await appendEvent(buildInput({ payload }));

    expect(event.payload).toEqual(payload);
  });

  it("debe asignar position autoincremental", async () => {
    const first = await appendEvent(buildInput());
    const second = await appendEvent(buildInput());

    expect(second.position).toBeGreaterThan(first.position);
  });

  it("debe almacenar metadata, correlationId y causationId opcionales", async () => {
    const event = await appendEvent(
      buildInput({
        metadata: { actor: "system" },
        correlationId: TEST_CORRELATION_ID,
        causationId: "cause-123",
        version: 1,
      }),
    );

    expect(event.metadata).toEqual({ actor: "system" });
    expect(event.correlationId).toBe(TEST_CORRELATION_ID);
    expect(event.causationId).toBe("cause-123");
    expect(event.version).toBe(1);
  });
});

describe("getEventsByAggregate", () => {
  const aggregateId = `agg-${Date.now()}`;
  const otherAggregateId = `agg-other-${Date.now()}`;

  beforeEach(async () => {
    await appendEvent(
      buildInput({ aggregateId, payload: { order: 1 } }),
    );
    await appendEvent(
      buildInput({ aggregateId, payload: { order: 2 } }),
    );
    await appendEvent(
      buildInput({ aggregateId, payload: { order: 3 } }),
    );
    await appendEvent(
      buildInput({
        aggregateId: otherAggregateId,
        payload: { order: 99 },
      }),
    );
  });

  it("debe devolver solo los eventos del agregado solicitado", async () => {
    const events = await getEventsByAggregate("PROPERTY", aggregateId);

    expect(events).toHaveLength(3);
    events.forEach((e) => {
      expect(e.aggregateId).toBe(aggregateId);
    });
  });

  it("debe devolver los eventos en orden ascendente de position", async () => {
    const events = await getEventsByAggregate("PROPERTY", aggregateId);

    for (let i = 1; i < events.length; i++) {
      expect(events[i].position).toBeGreaterThan(events[i - 1].position);
    }
  });

  it("debe devolver array vacio para un agregado inexistente", async () => {
    const events = await getEventsByAggregate("PROPERTY", "no-existe");

    expect(events).toEqual([]);
  });

  it("debe respetar la opcion limit", async () => {
    const events = await getEventsByAggregate("PROPERTY", aggregateId, {
      limit: 2,
    });

    expect(events).toHaveLength(2);
  });
});

describe("getEventsSince", () => {
  let firstPosition: bigint;

  beforeEach(async () => {
    const e1 = await appendEvent(buildInput({ payload: { seq: 1 } }));
    await appendEvent(buildInput({ payload: { seq: 2 } }));
    await appendEvent(buildInput({ payload: { seq: 3 } }));
    firstPosition = e1.position;
  });

  it("debe devolver solo los eventos con position mayor que la dada", async () => {
    const events = await getEventsSince(firstPosition);

    expect(events.length).toBeGreaterThanOrEqual(2);
    events.forEach((e) => {
      expect(e.position).toBeGreaterThan(firstPosition);
    });
  });

  it("debe devolver todos los eventos cuando position es 0", async () => {
    const events = await getEventsSince(0n);

    expect(events.length).toBeGreaterThanOrEqual(3);
  });

  it("debe devolver array vacio cuando position es mayor que todos", async () => {
    const events = await getEventsSince(BigInt(Number.MAX_SAFE_INTEGER));

    expect(events).toEqual([]);
  });

  it("debe respetar la opcion limit", async () => {
    const events = await getEventsSince(firstPosition, { limit: 1 });

    expect(events).toHaveLength(1);
    expect(events[0].position).toBeGreaterThan(firstPosition);
  });

  it("debe filtrar por type cuando se especifica", async () => {
    await appendEvent(
      buildInput({
        type: "LEAD_INGESTADO",
        aggregateType: "LEAD",
        payload: { seq: 4 },
      }),
    );

    const events = await getEventsSince(firstPosition, {
      type: "LEAD_INGESTADO",
    });

    expect(events.length).toBeGreaterThanOrEqual(1);
    events.forEach((e) => {
      expect(e.type).toBe("LEAD_INGESTADO");
    });
  });
});
