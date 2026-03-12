import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { DemandDiffResult } from "../types";
import { publishDemandEventsForDiff } from "../event-publisher";

const TEST_RUN_ID = `demand-events-${Date.now()}`;
const cycleIds: string[] = [];

function cycleId(suffix: string): string {
  const id = `${TEST_RUN_ID}-${suffix}`;
  cycleIds.push(id);
  return id;
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

describe("demands event integration", () => {
  it("persiste eventos de demanda en Event Store", async () => {
    const diff: DemandDiffResult = {
      created: [
        {
          type: "created",
          demand: {
            codigo: "INTEG-D-C-1",
            ref: "R1",
            nombre: "Creada",
            estadoId: "20",
            estadoNombre: "Buscando",
            presupuestoMin: 100000,
            presupuestoMax: 200000,
            habitacionesMin: 2,
            tipos: "Piso",
            zonas: "Centro",
            fechaActualizacion: "2026-03-11 12:10:00",
            agente: "A1",
            raw: {},
          },
        },
      ],
      modified: [],
      statusChanged: [],
      unchanged: 0,
    };

    const cid = cycleId("1");
    const summary = await publishDemandEventsForDiff(diff, cid);
    expect(summary.emitted).toBe(1);

    const events = await prisma.event.findMany({
      where: { correlationId: cid },
      orderBy: { position: "asc" },
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("DEMANDA_CREADA");
    expect(events[0].aggregateType).toBe("DEMAND");
  });
});
