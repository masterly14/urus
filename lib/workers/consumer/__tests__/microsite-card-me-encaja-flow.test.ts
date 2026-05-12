/**
 * Test E2E del flujo "Me encaja" desde el botón del micrositio (M6).
 *
 * Cubre el canal canónico `microsite_card` introducido por el refactor:
 *
 *  1. POST a `/api/seleccion/[token]/feedback` con `decision=ME_INTERESA`
 *     emite un evento `SELECCION_COMPRADOR` con `source.channel="microsite_card"`
 *     y persiste `MicrositeSelectionFeedback` (upsert idempotente).
 *  2. El consumer drena `PROCESS_EVENT` → `handleSeleccionComprador`:
 *     - Avanza `leadStatus` a `VISITA_PENDIENTE`.
 *     - Notifica al comercial (mock de `notifyCommercialVisitInterest`).
 *     - Encola exactamente UN `SEND_BUYER_INTEREST_ACK` con
 *       `sourceEventId` del `SELECCION_COMPRADOR`.
 *  3. Un segundo POST con la misma propiedad devuelve **409** y no
 *     genera nuevos eventos ni nuevos jobs (idempotencia hard).
 *
 * Notas:
 *  - Llamamos al handler de la ruta directamente (sin levantar Next):
 *    importamos `POST` de `app/api/seleccion/[token]/feedback/route.ts` y
 *    le pasamos un `Request` sintético.
 *  - Mocks: `sendBuyerInterestAckToBuyer` y `notifyCommercialVisitInterest`
 *    (queremos verificar la *cola* y los efectos en BD, no Meta).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { runConsumerCycle } from "@/lib/workers/consumer";
import { runProjectionCycle } from "@/lib/projections";

vi.mock("@/lib/whatsapp/send", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/whatsapp/send")>();
  return {
    ...original,
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

import { POST as feedbackPOST } from "@/app/api/seleccion/[token]/feedback/route";
import { sendBuyerInterestAckToBuyer } from "@/lib/whatsapp/send";
import { notifyCommercialVisitInterest } from "@/lib/visitas/notify-commercial";

const mockedSendAck = vi.mocked(sendBuyerInterestAckToBuyer);
const mockedNotify = vi.mocked(notifyCommercialVisitInterest);

const TEST_RUN = `me-encaja-card-${Date.now()}`;
const WORKER_ID = `me-encaja-worker-${Date.now()}`;
const DEMAND_ID = `389${Date.now()}`;
const WA_ID = "34600555444";
const PROPERTY_ID = "sfx-card-001";
const OTHER_PROPERTY_ID = "sfx-card-002";
const COMERCIAL_ID = `com-card-${Date.now()}`;

const SELECTION_HOLDER: { id: string; token: string } = { id: "", token: "" };
const createdEventIds: string[] = [];

async function drainConsumer(maxCycles = 30): Promise<{ processed: number; failed: number }> {
  let totalProcessed = 0;
  let totalFailed = 0;
  for (let i = 0; i < maxCycles; i++) {
    const c = await runConsumerCycle({
      workerId: WORKER_ID,
      types: ["PROCESS_EVENT", "SEND_BUYER_INTEREST_ACK"],
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
  await prisma.event.deleteMany({
    where: {
      type: "SELECCION_COMPRADOR",
      aggregateId: DEMAND_ID,
    },
  });

  await prisma.demandCurrent.deleteMany({ where: { codigo: DEMAND_ID } });
  await prisma.demandSnapshot.deleteMany({ where: { codigo: DEMAND_ID } });
  await prisma.comercial.deleteMany({ where: { id: COMERCIAL_ID } });
}

beforeAll(async () => {
  await cleanup();

  await prisma.comercial.create({
    data: {
      id: COMERCIAL_ID,
      nombre: "Comercial Test Card",
      email: `card-${Date.now()}@test.com`,
      telefono: "34600000099",
      ciudad: "Córdoba",
    },
  });

  await prisma.demandCurrent.create({
    data: {
      codigo: DEMAND_ID,
      nombre: "Buyer Card Test",
      telefono: WA_ID,
      lastEventId: "seed",
      lastEventPosition: BigInt(0),
      lastEventAt: new Date(),
    },
  });

  const selection = await prisma.micrositeSelection.create({
    data: {
      demandId: DEMAND_ID,
      demandNombre: "Buyer Card Test",
      comercialId: COMERCIAL_ID,
      token: `card-test-${Date.now()}`,
      validationToken: `card-val-${Date.now()}`,
      status: "APPROVED",
      buyerPhone: WA_ID,
      statefoxQuery: {},
      resultFilters: {},
      properties: [
        {
          propertyId: PROPERTY_ID,
          title: "Piso luminoso en el Centro de Córdoba",
          price: 280000,
          zone: "Centro",
          city: "Córdoba",
          metersBuilt: 90,
          rooms: 3,
          baths: 1,
          extras: ["Ascensor"],
          images: [],
          link: "https://example.com",
          description: null,
          contactPhones: [],
          pricePerMeter: null,
          metersUsable: null,
          metersPlot: null,
          metersTerrace: null,
          floor: null,
          orientation: null,
          address: null,
          housing: null,
          latitude: null,
          longitude: null,
          energyCertRating: null,
          energyCertValue: null,
          yearBuilt: null,
          condition: null,
          advertiserType: null,
          advertiserName: null,
        },
        {
          propertyId: OTHER_PROPERTY_ID,
          title: "Dúplex con terraza en Chamberí",
          price: 395000,
          zone: "Chamberí",
          city: "Madrid",
          metersBuilt: 120,
          rooms: 3,
          baths: 2,
          extras: ["Terraza"],
          images: [],
          link: "https://example.com/duplex",
          description: null,
          contactPhones: [],
          pricePerMeter: null,
          metersUsable: null,
          metersPlot: null,
          metersTerrace: null,
          floor: null,
          orientation: null,
          address: null,
          housing: null,
          latitude: null,
          longitude: null,
          energyCertRating: null,
          energyCertValue: null,
          yearBuilt: null,
          condition: null,
          advertiserType: null,
          advertiserName: null,
        },
      ],
    },
  });

  SELECTION_HOLDER.id = selection.id;
  SELECTION_HOLDER.token = selection.token;
}, 30_000);

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
}, 30_000);

function buildFeedbackRequest(body: unknown): Request {
  return new Request(
    `http://localhost/api/seleccion/${SELECTION_HOLDER.token}/feedback`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "127.0.0.1",
        "user-agent": "vitest-me-encaja-test",
      },
      body: JSON.stringify(body),
    },
  );
}

describe("Botón 'Me encaja' del micrositio (M6) — flujo E2E", () => {
  it("primer click registra ME_INTERESA, persiste feedback y encola SEND_BUYER_INTEREST_ACK", async () => {
    const res = await feedbackPOST(buildFeedbackRequest({
      propertyId: PROPERTY_ID,
      decision: "ME_INTERESA",
    }), { params: Promise.resolve({ token: SELECTION_HOLDER.token }) });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; eventId: string; decision: string };
    expect(body.ok).toBe(true);
    expect(body.decision).toBe("ME_INTERESA");
    createdEventIds.push(body.eventId);

    const event = await prisma.event.findUnique({ where: { id: body.eventId } });
    expect(event).not.toBeNull();
    expect(event!.type).toBe("SELECCION_COMPRADOR");
    const evtPayload = event!.payload as Record<string, unknown>;
    expect(evtPayload.decision).toBe("ME_INTERESA");
    const evtSource = evtPayload.source as Record<string, unknown>;
    expect(evtSource.channel).toBe("microsite_card");

    const feedback = await prisma.micrositeSelectionFeedback.findUnique({
      where: {
        selectionId_propertyId: {
          selectionId: SELECTION_HOLDER.id,
          propertyId: PROPERTY_ID,
        },
      },
    });
    expect(feedback).not.toBeNull();
    expect(feedback!.decision).toBe("ME_INTERESA");

    await drainConsumer();

    expect(mockedNotify).toHaveBeenCalled();
    const notifyArgs = mockedNotify.mock.calls.at(-1)?.[0];
    expect(notifyArgs?.demandId).toBe(DEMAND_ID);
    expect(notifyArgs?.propertyIds).toEqual([PROPERTY_ID]);

    const ackJobs = await prisma.jobQueue.findMany({
      where: {
        type: "SEND_BUYER_INTEREST_ACK",
        sourceEventId: event!.id,
      },
    });
    expect(ackJobs.length).toBe(1);
    const ackPayload = ackJobs[0].payload as Record<string, unknown>;
    expect(ackPayload.selectionId).toBe(SELECTION_HOLDER.id);
    expect(ackPayload.propertyId).toBe(PROPERTY_ID);
    expect(ackPayload.demandId).toBe(DEMAND_ID);

    expect(mockedSendAck).toHaveBeenCalledTimes(1);
    const ackCallArgs = mockedSendAck.mock.calls[0];
    expect(ackCallArgs[0]).toBe(WA_ID);
    expect(ackCallArgs[1]).toMatchObject({
      buyerName: "Buyer Card Test",
      propertyTitle: "Piso luminoso en el Centro de Córdoba",
    });
  }, 60_000);

  it("segundo click sobre la MISMA propiedad responde 409 sin emitir nuevo evento ni job", async () => {
    const ackJobsBefore = await prisma.jobQueue.count({
      where: { type: "SEND_BUYER_INTEREST_ACK" },
    });
    const eventsBefore = await prisma.event.count({
      where: { type: "SELECCION_COMPRADOR", aggregateId: DEMAND_ID },
    });
    const ackSentBefore = mockedSendAck.mock.calls.length;

    const res = await feedbackPOST(buildFeedbackRequest({
      propertyId: PROPERTY_ID,
      decision: "ME_INTERESA",
    }), { params: Promise.resolve({ token: SELECTION_HOLDER.token }) });

    expect(res.status).toBe(409);
    const body = (await res.json()) as {
      ok: boolean;
      alreadyRecorded?: boolean;
      decision?: string;
    };
    expect(body.ok).toBe(false);
    expect(body.alreadyRecorded).toBe(true);
    expect(body.decision).toBe("ME_INTERESA");

    await drainConsumer();

    const ackJobsAfter = await prisma.jobQueue.count({
      where: { type: "SEND_BUYER_INTEREST_ACK" },
    });
    expect(ackJobsAfter).toBe(ackJobsBefore);

    const eventsAfter = await prisma.event.count({
      where: { type: "SELECCION_COMPRADOR", aggregateId: DEMAND_ID },
    });
    expect(eventsAfter).toBe(eventsBefore);

    expect(mockedSendAck.mock.calls.length).toBe(ackSentBefore);
  }, 60_000);

  it("click en una propiedad distinta sí encola un nuevo SEND_BUYER_INTEREST_ACK", async () => {
    const ackSentBefore = mockedSendAck.mock.calls.length;

    const res = await feedbackPOST(buildFeedbackRequest({
      propertyId: OTHER_PROPERTY_ID,
      decision: "ME_INTERESA",
    }), { params: Promise.resolve({ token: SELECTION_HOLDER.token }) });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; eventId: string };
    expect(body.ok).toBe(true);
    createdEventIds.push(body.eventId);

    await drainConsumer();

    const ackJobs = await prisma.jobQueue.findMany({
      where: {
        type: "SEND_BUYER_INTEREST_ACK",
        sourceEventId: body.eventId,
      },
    });
    expect(ackJobs.length).toBe(1);
    const payload = ackJobs[0].payload as Record<string, unknown>;
    expect(payload.propertyId).toBe(OTHER_PROPERTY_ID);

    expect(mockedSendAck.mock.calls.length).toBe(ackSentBefore + 1);
    const lastArgs = mockedSendAck.mock.calls.at(-1);
    expect(lastArgs?.[1]).toMatchObject({
      propertyTitle: "Dúplex con terraza en Chamberí",
    });
  }, 60_000);
});
