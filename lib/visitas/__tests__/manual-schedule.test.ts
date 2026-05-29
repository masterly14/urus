import { beforeEach, describe, expect, it, vi } from "vitest";

const mockVisitWorkItemFindUnique = vi.fn();
const mockComercialFindUnique = vi.fn();
const mockVisitSchedulingFindUnique = vi.fn();
const mockVisitSchedulingCreate = vi.fn();
const mockPropertyVisitSlotCount = vi.fn();
const mockPropertyVisitSlotCreate = vi.fn();
const mockParteFindUnique = vi.fn();
const mockParteUpdate = vi.fn();
const mockVisitWorkItemUpdate = vi.fn();
const mockAppendEvent = vi.fn();
const mockEnqueueJob = vi.fn();
const mockUpdateDemandLeadStatus = vi.fn();
const mockCancelVisitAtomically = vi.fn();
const mockCreateCalendarEventDirect = vi.fn();
const mockCancelCalendarEvent = vi.fn();
const mockScheduleParteVisitaFromDetails = vi.fn();
const mockFetch = vi.fn();

vi.stubGlobal("fetch", mockFetch);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    comercial: {
      findUnique: (...args: unknown[]) => mockComercialFindUnique(...args),
    },
    visitSchedulingSession: {
      findUnique: (...args: unknown[]) => mockVisitSchedulingFindUnique(...args),
      create: (...args: unknown[]) => mockVisitSchedulingCreate(...args),
    },
    propertyVisitSlot: {
      count: (...args: unknown[]) => mockPropertyVisitSlotCount(...args),
      create: (...args: unknown[]) => mockPropertyVisitSlotCreate(...args),
    },
    parteVisitaSession: {
      findUnique: (...args: unknown[]) => mockParteFindUnique(...args),
      update: (...args: unknown[]) => mockParteUpdate(...args),
    },
    visitWorkItem: {
      update: (...args: unknown[]) => mockVisitWorkItemUpdate(...args),
    },
  },
}));

vi.mock("@/lib/event-store/event-store", () => ({
  appendEvent: (...args: unknown[]) => mockAppendEvent(...args),
}));

vi.mock("@/lib/job-queue", () => ({
  enqueueJob: (...args: unknown[]) => mockEnqueueJob(...args),
}));

vi.mock("@/lib/projections/update-lead-status", () => ({
  updateDemandLeadStatus: (...args: unknown[]) => mockUpdateDemandLeadStatus(...args),
}));

vi.mock("@/lib/visit-scheduling/confirm-visit", () => ({
  cancelVisitAtomically: (...args: unknown[]) => mockCancelVisitAtomically(...args),
}));

vi.mock("@/lib/composio/calendar", () => ({
  createCalendarEventDirect: (...args: unknown[]) => mockCreateCalendarEventDirect(...args),
  cancelCalendarEvent: (...args: unknown[]) => mockCancelCalendarEvent(...args),
}));

vi.mock("@/lib/parte-visita/schedule", () => ({
  scheduleParteVisitaFromDetails: (...args: unknown[]) => mockScheduleParteVisitaFromDetails(...args),
}));

vi.mock("../work-items", () => ({
  getVisitWorkItem: (...args: unknown[]) => mockVisitWorkItemFindUnique(...args),
  markVisitWorkItemScheduled: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../interest-package", () => ({
  getVisitInterestPackageByDemand: vi.fn(),
}));

import { cancelManualVisit, scheduleManualVisit } from "../manual-schedule";

const workItem = {
  id: "work-1",
  demandId: "DEM-1",
  draftDemandId: null,
  propertyId: "PROP-1",
  draftPropertyId: null,
  propertySource: "external",
  comercialId: "com-1",
  buyerName: "Diana",
  buyerPhone: "34600000000",
  propertySnapshot: {
    title: "Piso Test",
    reference: "URUS-TEST",
    cadastralReference: null,
    address: "Calle Test 1",
    city: "Cordoba",
    zone: "Centro",
    price: 100000,
    rooms: 2,
    metersBuilt: 80,
    portalUrl: null,
  },
  contactSnapshot: {
    kind: "propietario",
    name: "Propietario",
    phones: ["34611111111"],
    source: "property_current",
    missingContactPhone: false,
  },
  missingContactPhone: false,
  scheduledSessionId: "visit-1",
  createdAt: new Date("2026-05-21T10:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.QSTASH_TOKEN = "qstash-token";
  mockVisitWorkItemFindUnique.mockResolvedValue(workItem);
  mockComercialFindUnique.mockResolvedValue({
    id: "com-1",
    nombre: "FEDE",
    composioConnectionId: "ca_calendar_1",
    waId: "34622222222",
    telefono: "622222222",
  });
  mockPropertyVisitSlotCount.mockResolvedValue(0);
  mockPropertyVisitSlotCreate.mockResolvedValue({ id: "slot-1" });
  mockVisitSchedulingCreate.mockResolvedValue({ id: "visit-new" });
  mockCreateCalendarEventDirect.mockResolvedValue({
    success: true,
    eventId: "calendar-1",
    link: "https://calendar.test/event",
  });
  mockScheduleParteVisitaFromDetails.mockResolvedValue({ status: "scheduled" });
  mockAppendEvent.mockResolvedValue({ id: "event-1" });
  mockEnqueueJob.mockResolvedValue({ id: "job-1" });
  mockUpdateDemandLeadStatus.mockResolvedValue(undefined);
  mockVisitWorkItemUpdate.mockResolvedValue({});
  mockCancelVisitAtomically.mockResolvedValue(undefined);
  mockCancelCalendarEvent.mockResolvedValue({ success: true });
  mockParteFindUnique.mockResolvedValue({
    id: "parte-1",
    state: "PENDING",
    qstashMessageId: "msg_qstash_1",
  });
  mockParteUpdate.mockResolvedValue({});
  mockFetch.mockResolvedValue({ ok: true, status: 202, statusText: "Accepted" });
});

describe("scheduleManualVisit", () => {
  it("programa el parte de visita con dirección, precio y operación de propiedad provisional", async () => {
    mockVisitWorkItemFindUnique.mockResolvedValue({
      ...workItem,
      propertyId: "",
      draftPropertyId: "draft-prop-1",
      propertySource: "draft",
      propertySnapshot: {
        title: "Propiedad provisional",
        reference: "DRAFT-draft-prop-1",
        cadastralReference: "1234567UG4913S",
        address: "Calle Flamencos 8, La Carlota, Córdoba",
        price: 275000,
        operationType: "ALQUILER",
      },
    });

    await scheduleManualVisit({
      visitWorkItemId: "work-1",
      fecha: "2026-05-22",
      horaInicio: "10:00",
      horaFin: "11:00",
      comercialId: "com-1",
    });

    expect(mockScheduleParteVisitaFromDetails).toHaveBeenCalledWith(
      expect.objectContaining({
        direccion: "Calle Flamencos 8, La Carlota, Córdoba",
        precio: 275000,
        tipoOperacion: "ALQUILER",
      }),
    );
  });

  it("crea el evento de Google Calendar con la API directa de Composio, sin agente LLM", async () => {
    const result = await scheduleManualVisit({
      visitWorkItemId: "work-1",
      fecha: "2026-05-22",
      horaInicio: "10:00",
      horaFin: "11:00",
      comercialId: "com-1",
      notas: "Contexto interno",
    });

    expect(result.calendar.eventId).toBe("calendar-1");
    expect(mockCreateCalendarEventDirect).toHaveBeenCalledOnce();
    expect(mockCreateCalendarEventDirect).toHaveBeenCalledWith(
      "ca_calendar_1",
      expect.objectContaining({
        summary: expect.stringContaining("Visita:"),
        startDatetime: "2026-05-22T10:00:00",
        endDatetime: "2026-05-22T11:00:00",
        location: "Calle Test 1",
      }),
    );
  });
});

describe("cancelManualVisit", () => {
  it("cancela Google Calendar, borra el mensaje QStash y marca el parte como CANCELADA", async () => {
    mockVisitSchedulingFindUnique.mockResolvedValue({
      id: "visit-1",
      calendarEventId: "calendar-1",
    });

    const result = await cancelManualVisit({
      visitWorkItemId: "work-1",
      comercialId: "com-1",
      reason: "Cliente cancela",
    });

    expect(result.calendarCancelled).toBe(true);
    expect(result.qstashMessageDeleted).toBe(true);
    expect(mockCancelCalendarEvent).toHaveBeenCalledWith("ca_calendar_1", "calendar-1");
    expect(mockParteUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: "parte-1" },
      data: { state: "CANCELADA" },
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://qstash.upstash.io/v2/messages/msg_qstash_1",
      {
        method: "DELETE",
        headers: { Authorization: "Bearer qstash-token" },
      },
    );
    expect(mockParteUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: "parte-1" },
      data: { qstashMessageId: null },
    });
  });

  it("si QStash DELETE falla, mantiene el parte CANCELADA para que /send no envíe", async () => {
    mockVisitSchedulingFindUnique.mockResolvedValue({
      id: "visit-1",
      calendarEventId: "calendar-1",
    });
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: vi.fn().mockResolvedValue("boom"),
    });

    const result = await cancelManualVisit({
      visitWorkItemId: "work-1",
      comercialId: "com-1",
      reason: "Cliente cancela",
    });

    expect(result.qstashMessageDeleted).toBe(false);
    expect(mockParteUpdate).toHaveBeenCalledWith({
      where: { id: "parte-1" },
      data: { state: "CANCELADA" },
    });
    expect(mockParteUpdate).toHaveBeenCalledTimes(1);
  });
});
