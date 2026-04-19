/**
 * Test de integración E2E del feedback loop del comprador (Item 2):
 *
 * Flujo verificado:
 * 1. Setup: demands_current + demand_snapshots + MicrositeSelection + WhatsAppBuyerSession
 * 2. WHATSAPP_RECIBIDO → NLU (stub determinista) → SELECCION_COMPRADOR + DEMANDA_ACTUALIZADA
 * 3. Consumer drena PROCESS_EVENT → handlers emiten follow-up jobs
 * 4. Verificar: WRITE_TO_INMOVILLA encolado con patch correcto
 * 5. Verificar: GENERATE_MICROSITE encolado con source.selectionId
 * 6. Verificar: MicrositeSelectionFeedback persistido
 *
 * Usa BD real (Neon). Mock: classifyBuyerFeedback (determinista).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";
import { enqueueJob } from "@/lib/job-queue";
import { runConsumerCycle } from "@/lib/workers/consumer";
import { runProjectionCycle } from "@/lib/projections";
import type { NLUResult } from "@/lib/agents/types";

vi.mock("@/lib/agents", () => ({
  classifyBuyerFeedback: vi.fn(),
}));

import { classifyBuyerFeedback } from "@/lib/agents";
const mockedNLU = vi.mocked(classifyBuyerFeedback);

const TEST_RUN = `feedback-e2e-${Date.now()}`;
const WORKER_ID = `feedback-worker-${Date.now()}`;
const DEMAND_ID = `389${Date.now()}`;
const SELECTION_ID_HOLDER: { id: string; token: string } = { id: "", token: "" };
const WA_ID = "34600999888";
const PROPERTY_ID = "sfx-test-001";

const createdEventIds: string[] = [];

async function cleanup() {
  await prisma.micrositeSelectionFeedback.deleteMany({
    where: { selection: { demandId: DEMAND_ID } },
  });
  await prisma.whatsAppBuyerSession.deleteMany({ where: { waId: WA_ID } });
  await prisma.micrositeSelection.deleteMany({ where: { demandId: DEMAND_ID } });

  if (createdEventIds.length > 0) {
    await prisma.jobQueue.deleteMany({
      where: { sourceEventId: { in: createdEventIds } },
    });
  }
  await prisma.jobQueue.deleteMany({
    where: {
      payload: { path: ["demandId"], equals: DEMAND_ID },
    },
  });

  const testEvents = await prisma.event.findMany({
    where: { correlationId: { startsWith: TEST_RUN } },
    select: { id: true },
  });
  const testEventIds = testEvents.map((e) => e.id);
  if (testEventIds.length > 0) {
    await prisma.jobQueue.deleteMany({
      where: { sourceEventId: { in: testEventIds } },
    });
  }
  await prisma.event.deleteMany({
    where: { correlationId: { startsWith: TEST_RUN } },
  });

  await prisma.demandCurrent.deleteMany({ where: { codigo: DEMAND_ID } });
  await prisma.demandSnapshot.deleteMany({ where: { codigo: DEMAND_ID } });
}

async function drainConsumer(maxCycles = 30): Promise<{ processed: number; failed: number }> {
  let totalProcessed = 0;
  let totalFailed = 0;

  for (let i = 0; i < maxCycles; i++) {
    const consumer = await runConsumerCycle({ workerId: WORKER_ID, types: ["PROCESS_EVENT"] });
    const projection = await runProjectionCycle({ workerId: WORKER_ID });
    totalProcessed += consumer.processed;
    totalFailed += consumer.failed;
    if (consumer.noWork && projection.noWork) break;
  }

  return { processed: totalProcessed, failed: totalFailed };
}

beforeAll(async () => {
  await cleanup();

  await prisma.demandCurrent.create({
    data: {
      codigo: DEMAND_ID,
      nombre: "Test Buyer",
      telefono: WA_ID,
      presupuestoMin: 200000,
      presupuestoMax: 400000,
      habitacionesMin: 2,
      tipos: "Piso",
      zonas: "Centro",
      lastEventId: "seed",
      lastEventPosition: BigInt(0),
      lastEventAt: new Date(),
    },
  });

  await prisma.demandSnapshot.create({
    data: {
      codigo: DEMAND_ID,
      ref: ".auto_test.",
      nombre: "Test Buyer",
      presupuestoMin: 200000,
      presupuestoMax: 400000,
      habitacionesMin: 2,
      tipos: "Piso",
      zonas: "Centro",
      raw: {
        keycli: "10001",
        keyagente: "20001",
        tipopropiedad: "2799,3399",
      },
    },
  });

  const selection = await prisma.micrositeSelection.create({
    data: {
      demandId: DEMAND_ID,
      demandNombre: "Test Buyer",
      comercialId: "system",
      token: `fbk-test-${Date.now()}`,
      validationToken: `val-test-${Date.now()}`,
      status: "APPROVED",
      buyerPhone: WA_ID,
      statefoxQuery: {},
      resultFilters: {},
      properties: [
        {
          propertyId: PROPERTY_ID,
          title: "Piso Centro Córdoba",
          price: 280000,
          zone: "Centro",
          city: "Córdoba",
          metersBuilt: 90,
          rooms: 3,
          baths: 1,
          extras: ["Ascensor"],
          images: ["https://example.com/img1.jpg"],
          link: "https://example.com",
        },
      ],
    },
  });

  SELECTION_ID_HOLDER.id = selection.id;
  SELECTION_ID_HOLDER.token = selection.token;

  await prisma.whatsAppBuyerSession.create({
    data: {
      waId: WA_ID,
      demandId: DEMAND_ID,
      selectionId: selection.id,
      selectionToken: selection.token,
    },
  });
}, 30_000);

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
}, 30_000);

describe("Feedback loop E2E (WA-only)", () => {
  it("procesa WHATSAPP_RECIBIDO y genera cadena completa de eventos y jobs", async () => {
    const stubbedNLU: NLUResult = {
      intention: "NO_ME_ENCAJA",
      confidence: 0.92,
      propertyFeedback: [
        { propertyId: PROPERTY_ID, sentiment: "NO_ME_ENCAJA" },
      ],
      variables: {
        precioMax: 350000,
        metrosMin: 80,
      },
      rawText: "El piso del centro se me queda pequeño y algo caro, busco algo más grande por menos de 350k",
      reasoning: "Buyer rejects property, wants lower price and more space",
      wantsMoreOptions: false,
    };
    mockedNLU.mockResolvedValueOnce(stubbedNLU);

    const waEvent = await appendEvent({
      type: "WHATSAPP_RECIBIDO",
      aggregateType: "WHATSAPP_CONVERSATION",
      aggregateId: WA_ID,
      payload: {
        messageId: `wamid.test.${Date.now()}`,
        from: WA_ID,
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: "text",
        text: { body: stubbedNLU.rawText },
      },
      correlationId: `${TEST_RUN}-wa`,
    });
    createdEventIds.push(waEvent.id);

    await enqueueJob({
      type: "PROCESS_EVENT",
      payload: { eventId: waEvent.id, eventType: waEvent.type },
      sourceEventId: waEvent.id,
      idempotencyKey: `process-event:${waEvent.id}`,
    });

    const round1 = await drainConsumer();
    expect(round1.failed).toBe(0);
    expect(round1.processed).toBeGreaterThanOrEqual(1);

    const seleccionEvents = await prisma.event.findMany({
      where: {
        type: "SELECCION_COMPRADOR",
        aggregateId: DEMAND_ID,
        correlationId: { startsWith: TEST_RUN },
      },
      orderBy: { position: "asc" },
    });
    expect(seleccionEvents.length).toBe(1);
    const scPayload = seleccionEvents[0].payload as Record<string, unknown>;
    expect(scPayload.propertyId).toBe(PROPERTY_ID);
    expect(scPayload.decision).toBe("NO_ME_ENCAJA");
    createdEventIds.push(seleccionEvents[0].id);

    const demandaEvents = await prisma.event.findMany({
      where: {
        type: "DEMANDA_ACTUALIZADA",
        aggregateId: DEMAND_ID,
        correlationId: { startsWith: TEST_RUN },
      },
    });
    expect(demandaEvents.length).toBe(1);
    const daPayload = demandaEvents[0].payload as Record<string, unknown>;
    const daVars = daPayload.variables as Record<string, unknown>;
    expect(daVars.precioMax).toBe(350000);
    expect(daVars.metrosMin).toBe(80);
    const daSource = daPayload.source as Record<string, unknown>;
    expect(daSource.channel).toBe("whatsapp_feedback");
    expect(daSource.selectionId).toBe(SELECTION_ID_HOLDER.id);
    createdEventIds.push(demandaEvents[0].id);

    const round2 = await drainConsumer();
    expect(round2.failed).toBe(0);

    const writeJobs = await prisma.jobQueue.findMany({
      where: {
        type: "WRITE_TO_INMOVILLA",
        sourceEventId: demandaEvents[0].id,
      },
    });
    expect(writeJobs.length).toBe(1);
    const writePayload = writeJobs[0].payload as Record<string, unknown>;
    expect(writePayload.operation).toBe("updateDemandCriteria");
    const writeArgs = writePayload.args as Record<string, unknown>;
    const patch = writeArgs.patch as Record<string, unknown>;
    expect(patch.presupuestoMax).toBe(350000);
    expect(patch.metrosMin).toBe(80);

    const micrositeJobs = await prisma.jobQueue.findMany({
      where: {
        type: "GENERATE_MICROSITE",
        sourceEventId: demandaEvents[0].id,
      },
    });
    expect(micrositeJobs.length).toBe(1);
    const msPayload = micrositeJobs[0].payload as Record<string, unknown>;
    expect(msPayload.demandId).toBe(DEMAND_ID);
    const msDemand = msPayload.demand as Record<string, unknown>;
    expect(msDemand.metrosMin).toBe(80);

    const feedback = await prisma.micrositeSelectionFeedback.findUnique({
      where: {
        selectionId_propertyId: {
          selectionId: SELECTION_ID_HOLDER.id,
          propertyId: PROPERTY_ID,
        },
      },
    });
    expect(feedback).not.toBeNull();
    expect(feedback!.decision).toBe("NO_ME_ENCAJA");

    const session = await prisma.whatsAppBuyerSession.findUnique({
      where: { waId: WA_ID },
    });
    expect(session).not.toBeNull();
    expect(session!.turnCount).toBeGreaterThanOrEqual(1);
  }, 60_000);
});
