import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { PropertyDiffResult } from "../types";
import { publishEventsForDiff } from "../event-publisher";

const TEST_RUN_ID = `ingestion-events-${Date.now()}`;
const cycleIds: string[] = [];

function testCycleId(suffix: string): string {
  const id = `${TEST_RUN_ID}-${suffix}`;
  cycleIds.push(id);
  return id;
}

function buildDiffForIntegration(): PropertyDiffResult {
  return {
    created: [
      {
        type: "created",
        property: {
          codigo: "INTEG-C-1",
          ref: "REF-INTEG-C-1",
          titulo: "Alta integración",
          tipoOfer: "Piso",
          precio: 210_000,
          metrosConstruidos: 85,
          habitaciones: 3,
          banyos: 2,
          ciudad: "Madrid",
          zona: "Centro",
          estado: "Activo",
          fechaAlta: "2026-03-11 08:00:00",
          fechaActualizacion: "2026-03-11 08:00:00",
          numFotos: 7,
          agente: "Agent",
          raw: {},
        },
      },
    ],
    modified: [
      {
        type: "modified",
        property: {
          codigo: "INTEG-M-1",
          ref: "REF-INTEG-M-1",
          titulo: "Mod integración",
          tipoOfer: "Piso",
          precio: 275_000,
          metrosConstruidos: 90,
          habitaciones: 3,
          banyos: 2,
          ciudad: "Madrid",
          zona: "Retiro",
          estado: "Activo",
          fechaAlta: "2026-03-01 10:00:00",
          fechaActualizacion: "2026-03-11 08:10:00",
          numFotos: 9,
          agente: "Agent",
          raw: {},
        },
        before: {
          precio: 260_000,
          metrosConstruidos: 90,
          habitaciones: 3,
          banyos: 2,
          ciudad: "Madrid",
          zona: "Retiro",
          estado: "Activo",
          fechaActualizacion: "2026-03-10 08:10:00",
        },
        changedFields: ["precio", "fechaActualizacion"],
      },
    ],
    statusChanged: [
      {
        type: "status_changed",
        property: {
          codigo: "INTEG-S-1",
          ref: "REF-INTEG-S-1",
          titulo: "Estado integración",
          tipoOfer: "Piso",
          precio: 300_000,
          metrosConstruidos: 95,
          habitaciones: 4,
          banyos: 2,
          ciudad: "Madrid",
          zona: "Salamanca",
          estado: "Reservado",
          fechaAlta: "2026-03-01 10:00:00",
          fechaActualizacion: "2026-03-11 08:20:00",
          numFotos: 10,
          agente: "Agent",
          raw: {},
        },
        previousEstado: "Activo",
        newEstado: "Reservado",
        otherChangedFields: ["fechaActualizacion"],
      },
    ],
    unchanged: 0,
  };
}

beforeEach(async () => {
  if (cycleIds.length > 0) {
    await prisma.event.deleteMany({
      where: { correlationId: { in: cycleIds } },
    });
  }
});

afterAll(async () => {
  if (cycleIds.length > 0) {
    await prisma.event.deleteMany({
      where: { correlationId: { in: cycleIds } },
    });
  }
  await prisma.$disconnect();
});

describe("publishEventsForDiff integration (Neon Event Store)", () => {
  it("debe persistir los eventos en events con correlationId y metadata", async () => {
    const cycleId = testCycleId("case-1");
    const diff = buildDiffForIntegration();

    const summary = await publishEventsForDiff(diff, cycleId);
    expect(summary.emitted).toBe(3);

    const events = await prisma.event.findMany({
      where: { correlationId: cycleId },
      orderBy: { position: "asc" },
    });

    expect(events).toHaveLength(3);
    expect(events.map((e) => e.type).sort()).toEqual([
      "ESTADO_CAMBIADO",
      "PROPIEDAD_CREADA",
      "PROPIEDAD_MODIFICADA",
    ]);

    for (const event of events) {
      const metadata = event.metadata as Record<string, unknown>;
      expect(event.aggregateType).toBe("PROPERTY");
      expect(metadata.source).toBe("ingestion:properties");
      expect(metadata.cycleId).toBe(cycleId);
      expect(typeof metadata.fingerprint).toBe("string");
      expect((metadata.fingerprint as string).length).toBe(64);
    }
  });
});
