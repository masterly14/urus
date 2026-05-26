import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockEventFindFirst,
  mockWhatsAppBuyerSessionUpsert,
  mockSendMatchNotification,
} = vi.hoisted(() => ({
  mockEventFindFirst: vi.fn(),
  mockWhatsAppBuyerSessionUpsert: vi.fn(),
  mockSendMatchNotification: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findFirst: mockEventFindFirst },
    whatsAppBuyerSession: { upsert: mockWhatsAppBuyerSessionUpsert },
  },
}));

vi.mock("@/lib/whatsapp/send", () => ({
  sendMatchNotification: (...args: unknown[]) => mockSendMatchNotification(...args),
}));

vi.mock("@/lib/microsite/app-url", () => ({
  getPublicAppUrl: () => "https://app.example.com",
}));

const { sendMatchWhatsAppHot } = await import("../send-match-whatsapp");

describe("sendMatchWhatsAppHot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWhatsAppBuyerSessionUpsert.mockResolvedValue(undefined);
    mockSendMatchNotification.mockResolvedValue({ messages: [{ id: "wamid.1" }] });
  });

  it("bloquea el envío si el MATCH_GENERADO fue invalidado", async () => {
    mockEventFindFirst.mockImplementation((args: { where: { type: string } }) => {
      if (args.where.type === "MATCH_INVALIDADO") {
        return Promise.resolve({ id: "evt-invalidado" });
      }
      return Promise.resolve(null);
    });

    const result = await sendMatchWhatsAppHot({
      matchEventId: "evt-match",
      demandId: "DEM-001",
      propertyId: "PROP-001",
      buyerPhone: "+34 600 111 222",
      buyerName: "Comprador",
      source: "test",
    });

    expect(result).toEqual({
      ok: false,
      invalidated: true,
      error: "Cruce invalidado por incompatibilidad geográfica",
    });
    expect(mockSendMatchNotification).not.toHaveBeenCalled();
    expect(mockWhatsAppBuyerSessionUpsert).not.toHaveBeenCalled();
  });
});
