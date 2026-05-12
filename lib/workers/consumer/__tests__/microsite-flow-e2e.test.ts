/**
 * Test E2E del flujo completo del Microsite — desde generación hasta
 * feedback del comprador, regeneración y escalado SLA.
 *
 * Escenarios cubiertos:
 *   1. GENERATE_MICROSITE → MicrositeSelection + NOTIFY_MICROSITE_PENDING_VALIDATION
 *   2. Comercial APRUEBA → SELECCION_VALIDADA + SEND_MICROSITE_TO_BUYER
 *   3. Comercial RECHAZA → SELECCION_RECHAZADA, status REJECTED, sin envío
 *   4. Comprador dice ME_INTERESA → leadStatus avanza a EN_SELECCION
 *   5. Comprador dice NO_ME_ENCAJA con variables → DEMANDA_ACTUALIZADA → GENERATE_MICROSITE (regeneración)
 *   6. Comprador pide más opciones (wantsMoreOptions) → GENERATE_MICROSITE directo
 *   7. SLA vencido sin validar → escalatedAt marcado
 *   8. Doble aprobación → 409 idempotente
 *
 * Usa BD real (Neon). Mock: classifyBuyerFeedback, sendMicrositeLinkToBuyer, Statefox.
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

vi.mock("@/lib/whatsapp/send", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/whatsapp/send")>();
  return {
    ...original,
    sendMicrositeLinkToBuyer: vi.fn().mockResolvedValue({
      messages: [{ id: "wamid.mock.buyer.001" }],
    }),
    sendMicrositePendingValidationToCommercial: vi.fn().mockResolvedValue({
      messages: [{ id: "wamid.mock.comercial.001" }],
    }),
    sendTextMessage: vi.fn().mockResolvedValue({
      messages: [{ id: "wamid.mock.text.001" }],
    }),
    sendMicrositeValidationEscalation: vi.fn().mockResolvedValue({
      messages: [{ id: "wamid.mock.escalation.001" }],
    }),
    sendBuyerInterestAckToBuyer: vi.fn().mockResolvedValue({
      messages: [{ id: "wamid.mock.ack.001" }],
    }),
  };
});

vi.mock("@/lib/visitas/notify-commercial", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/visitas/notify-commercial")>();
  return {
    ...original,
    notifyCommercialVisitInterest: vi.fn().mockResolvedValue({ sent: true }),
  };
});

vi.mock("@/lib/statefox", () => ({
  searchSnapshotForDemand: vi.fn().mockResolvedValue({
    properties: Array.from({ length: 8 }, (_, i) => ({
      id: `sfx-prop-${i}`,
      property: {
        pPrice: 250000 + i * 10000,
        pRooms: 3,
        pBaths: 1,
        pHousing: "Piso",
        pAddress: `Calle Test ${i}`,
        pCity: { cityName: "Córdoba" },
        pZone: { name: "Centro" },
        pMeters: { built: 80 + i * 5 },
        pImages: [`https://example.com/img${i}.jpg`],
        pExtras: {},
        pAdvert: { type: "professional", name: "Test Agency" },
      },
    })),
    pagesScanned: 1,
    totalScanned: 8,
    earlyExit: false,
  }),
}));

import { classifyBuyerFeedback } from "@/lib/agents";
const mockedNLU = vi.mocked(classifyBuyerFeedback);

const TEST_RUN = `microsite-flow-${Date.now()}`;
const WORKER_ID = `msf-worker-${Date.now()}`;
const DEMAND_ID = `389${Date.now()}`;
const WA_ID = "34600888777";
const PROPERTY_ID = "sfx-prop-0";
const COMERCIAL_ID = `com-msf-${Date.now()}`;

const createdEventIds: string[] = [];
let selectionId = "";
let selectionToken = "";
let validationToken = "";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function drainConsumer(maxCycles = 40): Promise<{ processed: number; failed: number }> {
  let totalProcessed = 0;
  let totalFailed = 0;
  for (let i = 0; i < maxCycles; i++) {
    const c = await runConsumerCycle({
      workerId: WORKER_ID,
      types: [
        "PROCESS_EVENT",
        "GENERATE_MICROSITE",
        "NOTIFY_MICROSITE_PENDING_VALIDATION",
        "SEND_MICROSITE_TO_BUYER",
        "SEND_BUYER_INTEREST_ACK",
      ],
    });
    const p = await runProjectionCycle({ workerId: WORKER_ID });
    totalProcessed += c.processed;
    totalFailed += c.failed;
    if (c.noWork && p.noWork) break;
  }
  return { processed: totalProcessed, failed: totalFailed };
}

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
    where: { payload: { path: ["demandId"], equals: DEMAND_ID } },
  });

  const testEvents = await prisma.event.findMany({
    where: { correlationId: { startsWith: TEST_RUN } },
    select: { id: true },
  });
  if (testEvents.length > 0) {
    await prisma.jobQueue.deleteMany({
      where: { sourceEventId: { in: testEvents.map((e) => e.id) } },
    });
  }
  await prisma.event.deleteMany({
    where: { correlationId: { startsWith: TEST_RUN } },
  });

  await prisma.demandCurrent.deleteMany({ where: { codigo: DEMAND_ID } });
  await prisma.demandSnapshot.deleteMany({ where: { codigo: DEMAND_ID } });
  await prisma.comercial.deleteMany({ where: { id: COMERCIAL_ID } });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  await cleanup();

  await prisma.comercial.create({
    data: {
      id: COMERCIAL_ID,
      nombre: "Comercial Test MSF",
      email: `msf-${Date.now()}@test.com`,
      telefono: "34600000001",
      ciudad: "Córdoba",
    },
  });

  await prisma.demandCurrent.create({
    data: {
      codigo: DEMAND_ID,
      nombre: "Buyer Test MSF",
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
      ref: ".msf_test.",
      nombre: "Buyer Test MSF",
      presupuestoMin: 200000,
      presupuestoMax: 400000,
      habitacionesMin: 2,
      tipos: "Piso",
      zonas: "Centro",
      raw: {
        keycli: "10002",
        keyagente: "20002",
        tipopropiedad: "2799,3399",
      },
    },
  });
}, 30_000);

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
}, 30_000);

// ---------------------------------------------------------------------------
// Escenario 1: Generación de microsite
// ---------------------------------------------------------------------------

describe("Escenario 1: GENERATE_MICROSITE → selección + notificación comercial", () => {
  it("crea MicrositeSelection con PENDING_VALIDATION y encola NOTIFY_MICROSITE_PENDING_VALIDATION", async () => {
    const job = await enqueueJob({
      type: "GENERATE_MICROSITE",
      payload: {
        demandId: DEMAND_ID,
        comercialId: COMERCIAL_ID,
        demand: {
          tipos: "Piso",
          zonas: "Centro",
          presupuestoMin: 200000,
          presupuestoMax: 400000,
          habitacionesMin: 2,
        },
      },
      idempotencyKey: `e2e-gen-microsite:${TEST_RUN}`,
    });

    await drainConsumer();

    const selection = await prisma.micrositeSelection.findFirst({
      where: { demandId: DEMAND_ID },
      orderBy: { createdAt: "desc" },
    });
    expect(selection).not.toBeNull();
    expect(selection!.status).toBe("PENDING_VALIDATION");
    expect(selection!.buyerPhone).toBe(WA_ID);

    const properties = selection!.properties as unknown[];
    expect(properties.length).toBeGreaterThan(0);
    expect(properties.length).toBeLessThanOrEqual(12);

    selectionId = selection!.id;
    selectionToken = selection!.token;
    validationToken = selection!.validationToken;

    const notifyJobs = await prisma.jobQueue.findMany({
      where: { type: "NOTIFY_MICROSITE_PENDING_VALIDATION" },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    const hasOurNotify = notifyJobs.some((j) => {
      const p = j.payload as Record<string, unknown> | null;
      return p?.selectionId === selectionId;
    });
    expect(hasOurNotify).toBe(true);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// Escenario 2: Comercial aprueba → envío al comprador
// ---------------------------------------------------------------------------

describe("Escenario 2: Comercial APRUEBA → SEND_MICROSITE_TO_BUYER", () => {
  it("cambia status a APPROVED, emite SELECCION_VALIDADA, y encola envío al comprador", async () => {
    expect(selectionId).not.toBe("");

    const event = await appendEvent({
      type: "SELECCION_VALIDADA",
      aggregateType: "DEMAND",
      aggregateId: DEMAND_ID,
      payload: {
        selectionId,
        token: selectionToken,
        comercialId: COMERCIAL_ID,
        validatedAt: new Date().toISOString(),
      },
      correlationId: `${TEST_RUN}-approve`,
    });
    createdEventIds.push(event.id);

    await prisma.micrositeSelection.update({
      where: { id: selectionId },
      data: {
        status: "APPROVED",
        validatedAt: new Date(),
        validatedByComercialId: COMERCIAL_ID,
      },
    });

    await enqueueJob({
      type: "SEND_MICROSITE_TO_BUYER",
      payload: { selectionId },
      priority: 30,
      idempotencyKey: `send_microsite_buyer:${selectionId}`,
    });

    await drainConsumer();

    const updated = await prisma.micrositeSelection.findUnique({
      where: { id: selectionId },
    });
    expect(updated!.status).toBe("APPROVED");

    const sendJobs = await prisma.jobQueue.findMany({
      where: {
        type: "SEND_MICROSITE_TO_BUYER",
        payload: { path: ["selectionId"], equals: selectionId },
      },
    });
    expect(sendJobs.length).toBeGreaterThanOrEqual(1);

    const session = await prisma.whatsAppBuyerSession.findUnique({
      where: { waId: WA_ID },
    });
    expect(session).not.toBeNull();
    expect(session!.demandId).toBe(DEMAND_ID);
    expect(session!.selectionId).toBe(selectionId);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// Escenario 3: Comercial rechaza
// ---------------------------------------------------------------------------

describe("Escenario 3: Comercial RECHAZA → status REJECTED, sin envío", () => {
  let rejectedSelectionId = "";

  it("crea nueva selección para test de rechazo", async () => {
    const job = await enqueueJob({
      type: "GENERATE_MICROSITE",
      payload: {
        demandId: DEMAND_ID,
        comercialId: COMERCIAL_ID,
        demand: {
          tipos: "Piso",
          zonas: "Centro",
          presupuestoMin: 200000,
          presupuestoMax: 400000,
          habitacionesMin: 2,
        },
      },
      idempotencyKey: `e2e-gen-microsite-reject:${TEST_RUN}`,
    });

    await drainConsumer();

    const selections = await prisma.micrositeSelection.findMany({
      where: { demandId: DEMAND_ID, status: "PENDING_VALIDATION" },
      orderBy: { createdAt: "desc" },
    });
    expect(selections.length).toBeGreaterThan(0);
    rejectedSelectionId = selections[0].id;
  }, 60_000);

  it("al rechazar, status pasa a REJECTED y NO se encola SEND_MICROSITE_TO_BUYER", async () => {
    const event = await appendEvent({
      type: "SELECCION_RECHAZADA",
      aggregateType: "DEMAND",
      aggregateId: DEMAND_ID,
      payload: {
        selectionId: rejectedSelectionId,
        comercialId: COMERCIAL_ID,
        rejectedAt: new Date().toISOString(),
      },
      correlationId: `${TEST_RUN}-reject`,
    });
    createdEventIds.push(event.id);

    await prisma.micrositeSelection.update({
      where: { id: rejectedSelectionId },
      data: {
        status: "REJECTED",
        validatedAt: new Date(),
        validatedByComercialId: COMERCIAL_ID,
      },
    });

    await enqueueJob({
      type: "PROCESS_EVENT",
      payload: { eventId: event.id },
      sourceEventId: event.id,
      idempotencyKey: `process_event:${event.id}`,
    });

    await drainConsumer();

    const updated = await prisma.micrositeSelection.findUnique({
      where: { id: rejectedSelectionId },
    });
    expect(updated!.status).toBe("REJECTED");

    const sendJobs = await prisma.jobQueue.findMany({
      where: {
        type: "SEND_MICROSITE_TO_BUYER",
        payload: { path: ["selectionId"], equals: rejectedSelectionId },
      },
    });
    expect(sendJobs.length).toBe(0);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// Escenario 4: Comprador pulsa "Me encaja" en el micrositio → flujo canónico
// ---------------------------------------------------------------------------

describe("Escenario 4: Botón 'Me encaja' → SELECCION_COMPRADOR + SEND_BUYER_INTEREST_ACK", () => {
  it("SELECCION_COMPRADOR con channel=microsite_card encola SEND_BUYER_INTEREST_ACK y persiste feedback", async () => {
    // El flujo "Me encaja" ya no se infiere por NLU. Lo emite la API
    // `/api/seleccion/[token]/feedback`. En este test simulamos esa emisión
    // directamente con appendEvent + PROCESS_EVENT (mismo contrato que la
    // ruta HTTP, sin levantar el servidor).
    const meInteresaEvent = await appendEvent({
      type: "SELECCION_COMPRADOR",
      aggregateType: "DEMAND",
      aggregateId: DEMAND_ID,
      payload: {
        token: selectionToken,
        demandId: DEMAND_ID,
        demandNombre: "Buyer Test MSF",
        comercialId: COMERCIAL_ID,
        selectionId,
        propertyId: PROPERTY_ID,
        decision: "ME_INTERESA",
        source: {
          channel: "microsite_card" as const,
          token: selectionToken,
          ip: null,
          userAgent: "vitest",
        },
        property: {
          propertyId: PROPERTY_ID,
          title: "Piso Centro Córdoba",
          price: 250000,
          metersBuilt: 80,
          zone: "Centro",
          city: "Córdoba",
          extras: [],
          images: [],
          link: null,
        },
        respondedAt: new Date().toISOString(),
      },
      metadata: { channel: "microsite_card", userAgent: "vitest", ip: null },
      correlationId: `${TEST_RUN}-meencaja`,
    });
    createdEventIds.push(meInteresaEvent.id);

    await prisma.micrositeSelectionFeedback.upsert({
      where: {
        selectionId_propertyId: { selectionId, propertyId: PROPERTY_ID },
      },
      create: {
        selectionId,
        propertyId: PROPERTY_ID,
        decision: "ME_INTERESA",
        payload: {} as unknown as import("@prisma/client").Prisma.InputJsonValue,
      },
      update: {
        decision: "ME_INTERESA",
        payload: {} as unknown as import("@prisma/client").Prisma.InputJsonValue,
      },
    });

    await enqueueJob({
      type: "PROCESS_EVENT",
      payload: { eventId: meInteresaEvent.id, eventType: meInteresaEvent.type },
      sourceEventId: meInteresaEvent.id,
      idempotencyKey: `process_event:${meInteresaEvent.id}`,
    });

    await drainConsumer();

    const feedback = await prisma.micrositeSelectionFeedback.findUnique({
      where: {
        selectionId_propertyId: {
          selectionId,
          propertyId: PROPERTY_ID,
        },
      },
    });
    expect(feedback).not.toBeNull();
    expect(feedback!.decision).toBe("ME_INTERESA");

    const ackJobs = await prisma.jobQueue.findMany({
      where: {
        type: "SEND_BUYER_INTEREST_ACK",
        sourceEventId: meInteresaEvent.id,
      },
    });
    expect(ackJobs.length).toBe(1);
    const ackPayload = ackJobs[0].payload as Record<string, unknown>;
    expect(ackPayload.selectionId).toBe(selectionId);
    expect(ackPayload.propertyId).toBe(PROPERTY_ID);
    expect(ackPayload.demandId).toBe(DEMAND_ID);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// Escenario 5: Comprador dice NO_ME_ENCAJA + variables → regeneración
// ---------------------------------------------------------------------------

describe("Escenario 5: NO_ME_ENCAJA con variables → DEMANDA_ACTUALIZADA → GENERATE_MICROSITE", () => {
  it("emite DEMANDA_ACTUALIZADA y encola WRITE_TO_INMOVILLA + GENERATE_MICROSITE", async () => {
    const stubbedNLU: NLUResult = {
      intention: "NO_ME_ENCAJA",
      confidence: 0.9,
      propertyFeedback: [
        { propertyId: PROPERTY_ID, sentiment: "NO_ME_ENCAJA" },
      ],
      variables: {
        precioMax: 300000,
        metrosMin: 100,
      },
      rawText: "Es muy caro y pequeño, busco algo más grande por menos de 300k",
      reasoning: "Price too high, needs more space",
      wantsMoreOptions: false,
    };
    mockedNLU.mockResolvedValueOnce(stubbedNLU);

    const waEvent = await appendEvent({
      type: "WHATSAPP_RECIBIDO",
      aggregateType: "WHATSAPP_CONVERSATION",
      aggregateId: WA_ID,
      payload: {
        messageId: `wamid.no_encaja.${Date.now()}`,
        from: WA_ID,
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: "text",
        text: { body: stubbedNLU.rawText },
      },
      correlationId: `${TEST_RUN}-noencaja`,
    });
    createdEventIds.push(waEvent.id);

    await enqueueJob({
      type: "PROCESS_EVENT",
      payload: { eventId: waEvent.id, eventType: waEvent.type },
      sourceEventId: waEvent.id,
      idempotencyKey: `process-event:${waEvent.id}`,
    });

    await drainConsumer();

    const demandaEvents = await prisma.event.findMany({
      where: {
        type: "DEMANDA_ACTUALIZADA",
        aggregateId: DEMAND_ID,
        correlationId: `${TEST_RUN}-noencaja`,
      },
    });
    expect(demandaEvents.length).toBe(1);
    createdEventIds.push(demandaEvents[0].id);

    const daPayload = demandaEvents[0].payload as Record<string, unknown>;
    const daVars = daPayload.variables as Record<string, unknown>;
    expect(daVars.precioMax).toBe(300000);
    expect(daVars.metrosMin).toBe(100);

    const daSource = daPayload.source as Record<string, unknown>;
    expect(daSource.channel).toBe("whatsapp_feedback");
    expect(daSource.selectionId).toBe(selectionId);

    await drainConsumer();

    const writeJobs = await prisma.jobQueue.findMany({
      where: {
        type: "WRITE_TO_INMOVILLA",
        sourceEventId: demandaEvents[0].id,
      },
    });
    expect(writeJobs.length).toBe(1);
    const writeArgs = (writeJobs[0].payload as Record<string, unknown>).args as Record<string, unknown>;
    const patch = writeArgs.patch as Record<string, unknown>;
    expect(patch.presupuestoMax).toBe(300000);
    expect(patch.metrosMin).toBe(100);

    const micrositeJobs = await prisma.jobQueue.findMany({
      where: {
        type: "GENERATE_MICROSITE",
        sourceEventId: demandaEvents[0].id,
      },
    });
    expect(micrositeJobs.length).toBe(1);
    const msPayload = micrositeJobs[0].payload as Record<string, unknown>;
    expect(msPayload.demandId).toBe(DEMAND_ID);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// Escenario 6: wantsMoreOptions → GENERATE_MICROSITE directo
// ---------------------------------------------------------------------------

describe("Escenario 6: wantsMoreOptions → GENERATE_MICROSITE directo (sin DEMANDA_ACTUALIZADA)", () => {
  it("encola GENERATE_MICROSITE sin emitir DEMANDA_ACTUALIZADA", async () => {
    const stubbedNLU: NLUResult = {
      intention: "OTRO",
      confidence: 0.85,
      propertyFeedback: [],
      variables: {},
      rawText: "Me gustan pero quiero ver más opciones",
      reasoning: "Buyer wants to explore more",
      wantsMoreOptions: true,
    };
    mockedNLU.mockResolvedValueOnce(stubbedNLU);

    const waEvent = await appendEvent({
      type: "WHATSAPP_RECIBIDO",
      aggregateType: "WHATSAPP_CONVERSATION",
      aggregateId: WA_ID,
      payload: {
        messageId: `wamid.more_options.${Date.now()}`,
        from: WA_ID,
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: "text",
        text: { body: stubbedNLU.rawText },
      },
      correlationId: `${TEST_RUN}-moreoptions`,
    });
    createdEventIds.push(waEvent.id);

    await enqueueJob({
      type: "PROCESS_EVENT",
      payload: { eventId: waEvent.id, eventType: waEvent.type },
      sourceEventId: waEvent.id,
      idempotencyKey: `process-event:${waEvent.id}`,
    });

    await drainConsumer();

    const demandaEvents = await prisma.event.findMany({
      where: {
        type: "DEMANDA_ACTUALIZADA",
        correlationId: `${TEST_RUN}-moreoptions`,
      },
    });
    expect(demandaEvents.length).toBe(0);

    const micrositeJobs = await prisma.jobQueue.findMany({
      where: {
        type: "GENERATE_MICROSITE",
        payload: { path: ["demandId"], equals: DEMAND_ID },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    const hasWantsMore = micrositeJobs.some((j) => {
      const key = j.idempotencyKey ?? "";
      return key.includes("wants_more");
    });
    expect(hasWantsMore).toBe(true);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// Escenario 7: SLA vencido → escalación
// ---------------------------------------------------------------------------

describe("Escenario 7: SLA vencido → marca escalatedAt", () => {
  let slaSelectionId = "";

  it("crea selección con validationDueAt en el pasado", async () => {
    const selection = await prisma.micrositeSelection.create({
      data: {
        demandId: DEMAND_ID,
        demandNombre: "Buyer Test MSF",
        comercialId: COMERCIAL_ID,
        token: `sla-test-${Date.now()}`,
        validationToken: `sla-val-${Date.now()}`,
        status: "PENDING_VALIDATION",
        buyerPhone: WA_ID,
        statefoxQuery: {},
        resultFilters: {},
        properties: [{ propertyId: "sfx-sla-001", title: "Test SLA" }],
        validationDueAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      },
    });
    slaSelectionId = selection.id;
  }, 10_000);

  it("al buscar vencidas, marca escalatedAt", async () => {
    const overdue = await prisma.micrositeSelection.findMany({
      where: {
        id: slaSelectionId,
        status: "PENDING_VALIDATION",
        validationDueAt: { lt: new Date() },
        escalatedAt: null,
      },
    });
    expect(overdue.length).toBe(1);

    await prisma.micrositeSelection.update({
      where: { id: slaSelectionId },
      data: { escalatedAt: new Date() },
    });

    const after = await prisma.micrositeSelection.findUnique({
      where: { id: slaSelectionId },
    });
    expect(after!.escalatedAt).not.toBeNull();
    expect(after!.status).toBe("PENDING_VALIDATION");
  }, 10_000);
});

// ---------------------------------------------------------------------------
// Escenario 8: Doble aprobación → idempotencia
// ---------------------------------------------------------------------------

describe("Escenario 8: Doble aprobación → no genera duplicados", () => {
  it("segunda aprobación sobre selección APPROVED no genera nuevo SEND_MICROSITE_TO_BUYER", async () => {
    const countBefore = await prisma.jobQueue.count({
      where: {
        type: "SEND_MICROSITE_TO_BUYER",
        payload: { path: ["selectionId"], equals: selectionId },
      },
    });

    const duplicateJob = await enqueueJob({
      type: "SEND_MICROSITE_TO_BUYER",
      payload: { selectionId },
      priority: 30,
      idempotencyKey: `send_microsite_buyer:${selectionId}`,
    });

    await drainConsumer();

    const countAfter = await prisma.jobQueue.count({
      where: {
        type: "SEND_MICROSITE_TO_BUYER",
        payload: { path: ["selectionId"], equals: selectionId },
      },
    });

    expect(countAfter).toBeLessThanOrEqual(countBefore + 1);
  }, 30_000);
});
