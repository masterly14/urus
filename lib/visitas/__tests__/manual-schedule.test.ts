import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetVisitInterestPackageByDemand = vi.fn();
const mockCreateCalendarEvent = vi.fn();
const mockAppendEvent = vi.fn();
const mockEnqueueJob = vi.fn();
const mockUpdateDemandLeadStatus = vi.fn();
const mockScheduleParteVisitaFromDetails = vi.fn();

const mockTx = {
  propertyVisitSlot: {
    count: vi.fn(),
    create: vi.fn(),
  },
  visitSchedulingSession: {
    create: vi.fn(),
  },
};

const mockPrisma = {
  comercial: {
    findUnique: vi.fn(),
  },
  propertyVisitSlot: {
    count: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
  visitSchedulingSession: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  $transaction: vi.fn(),
};

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/composio", () => ({
  createCalendarEvent: mockCreateCalendarEvent,
}));

vi.mock("@/lib/event-store/event-store", () => ({
  appendEvent: mockAppendEvent,
}));

vi.mock("@/lib/job-queue", () => ({
  enqueueJob: mockEnqueueJob,
}));

vi.mock("@/lib/projections/update-lead-status", () => ({
  updateDemandLeadStatus: mockUpdateDemandLeadStatus,
}));

vi.mock("@/lib/parte-visita/schedule", () => ({
  scheduleParteVisitaFromDetails: mockScheduleParteVisitaFromDetails,
}));

vi.mock("../interest-package", () => ({
  getVisitInterestPackageByDemand: mockGetVisitInterestPackageByDemand,
}));

import { scheduleManualVisit } from "../manual-schedule";

const baseInput = {
  demandId: "DEM-1",
  propertyId: "PROP-1",
  fecha: "2026-05-02",
  horaInicio: "10:00",
  horaFin: "11:00",
  comercialId: "COM-1",
};

const visitPackage = {
  demand: {
    demandId: "DEM-1",
    demandName: "Comprador Test",
    buyerPhone: "34600111222",
  },
  properties: [
    {
      propertyId: "PROP-1",
      title: "Piso Centro",
      reference: "REF-1",
      cadastralReference: "123ABC",
      contact: { phones: ["34666777888"] },
      address: "Calle Centro 1",
      price: 250000,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetVisitInterestPackageByDemand.mockResolvedValue(visitPackage);
  mockPrisma.comercial.findUnique.mockResolvedValue({
    id: "COM-1",
    nombre: "Comercial Test",
    composioConnectionId: "conn-1",
    waId: "34600999888",
    telefono: "34600999888",
  });
  mockTx.propertyVisitSlot.count.mockResolvedValue(0);
  mockTx.propertyVisitSlot.create.mockResolvedValue({ id: "slot-1" });
  mockTx.visitSchedulingSession.create.mockResolvedValue({
    id: "visit-1",
  });
  mockPrisma.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === "function") {
      return arg(mockTx);
    }
    return Promise.all(arg as Promise<unknown>[]);
  });
  mockPrisma.visitSchedulingSession.update.mockResolvedValue({ id: "visit-1" });
  mockCreateCalendarEvent.mockResolvedValue({
    success: true,
    eventId: "cal-1",
    link: "https://calendar.test/cal-1",
    raw: "{}",
  });
  mockAppendEvent.mockResolvedValue({ id: "event-1" });
  mockEnqueueJob.mockResolvedValue({ id: "job-1" });
  mockUpdateDemandLeadStatus.mockResolvedValue(undefined);
  mockScheduleParteVisitaFromDetails.mockResolvedValue(undefined);
});

describe("scheduleManualVisit", () => {
  it("reserva la visita antes de crear el evento de calendario", async () => {
    const result = await scheduleManualVisit(baseInput);

    expect(result.visitSessionId).toBe("visit-1");
    expect(mockTx.visitSchedulingSession.create).toHaveBeenCalled();
    expect(mockTx.propertyVisitSlot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          propertyCode: "PROP-1",
          sessionId: "visit-1",
        }),
      }),
    );
    expect(mockCreateCalendarEvent).toHaveBeenCalledOnce();
    expect(mockPrisma.visitSchedulingSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "visit-1" },
        data: expect.objectContaining({
          calendarEventId: "cal-1",
        }),
      }),
    );
  });

  it("rechaza una visita solapada sin llamar al calendario", async () => {
    mockTx.propertyVisitSlot.count.mockResolvedValue(1);

    await expect(scheduleManualVisit(baseInput)).rejects.toThrow(
      "La propiedad ya tiene una visita confirmada en ese horario",
    );

    expect(mockTx.propertyVisitSlot.create).not.toHaveBeenCalled();
    expect(mockCreateCalendarEvent).not.toHaveBeenCalled();
  });

  it("traduce el conflicto concurrente de la restricción de solape", async () => {
    const conflict = new Error("exclusion constraint violation") as Error & {
      code: string;
      meta: { constraint: string };
    };
    conflict.code = "P2004";
    conflict.meta = { constraint: "property_visit_slots_no_active_overlap" };
    mockTx.propertyVisitSlot.create.mockRejectedValue(conflict);

    await expect(scheduleManualVisit(baseInput)).rejects.toThrow(
      "La propiedad ya tiene una visita confirmada en ese horario",
    );

    expect(mockTx.visitSchedulingSession.create).toHaveBeenCalled();
    expect(mockCreateCalendarEvent).not.toHaveBeenCalled();
  });
});
