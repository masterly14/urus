import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EventRecord } from "@/lib/event-store/types";
import { handleFirmaCompletada } from "../firma-completada-handler";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    signatureRequest: {
      findUnique: vi.fn(),
    },
    legalDocument: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/whatsapp/send", () => ({
  sendFirmaCompletadaConfirmation: vi.fn(),
}));

vi.mock("@/lib/microsite/app-url", () => ({
  getPublicAppUrl: vi.fn().mockReturnValue("https://app.test"),
}));

import { prisma } from "@/lib/prisma";

function makeEvent(
  payloadOverrides: Record<string, unknown> = {},
): EventRecord {
  return {
    id: "evt-firma-001",
    position: BigInt(100),
    type: "FIRMA_COMPLETADA",
    aggregateType: "PROPERTY",
    aggregateId: "P-100",
    version: null,
    payload: {
      signatureRequestId: "sigreq-001",
      operationId: "OP-2026-001",
      documentKind: "arras",
      ...payloadOverrides,
    },
    metadata: null,
    correlationId: null,
    causationId: null,
    occurredAt: new Date(),
    createdAt: new Date(),
  };
}

const MOCK_SIG_REQ = {
  id: "sigreq-001",
  operationId: "OP-2026-001",
  propertyCode: "P-100",
  documentKind: "arras",
  templateVersion: "OP-2026-001_Arras_v1",
  cloudinaryUrl: "https://res.cloudinary.com/draft.pdf",
  signedDocumentUrl: "https://res.cloudinary.com/signed.pdf",
  auditTrailUrl: "https://res.cloudinary.com/audit.pdf",
  status: "COMPLETED",
};

const MOCK_LEGAL_DOC = {
  id: "ldoc-001",
  operationId: "OP-2026-001",
  propertyCode: "P-100",
  documentKind: "arras",
  signatureRequestId: "sigreq-001",
  status: "SIGNED",
};

describe("handleFirmaCompletada (in-house)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.signatureRequest.findUnique).mockResolvedValue(MOCK_SIG_REQ as never);
    vi.mocked(prisma.legalDocument.findUnique).mockResolvedValue(MOCK_LEGAL_DOC as never);
    process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
  });

  it("happy path: encola WRITE_TO_INMOVILLA sin descargar de proveedor externo", async () => {
    const event = makeEvent();
    const result = await handleFirmaCompletada(event);

    expect(result.success).toBe(true);
    expect(result.followUpJobs).toHaveLength(1);
    expect(result.followUpJobs![0].type).toBe("WRITE_TO_INMOVILLA");
    expect(result.followUpJobs![0].idempotencyKey).toBe(
      "write_inmovilla_post_firma:OP-2026-001",
    );
  });

  it("retorna error permanente si el payload es incompleto", async () => {
    const event = makeEvent({
      signatureRequestId: undefined,
    });
    event.payload = { operationId: "OP-001" };

    const result = await handleFirmaCompletada(event);

    expect(result.success).toBe(false);
    expect(result.permanent).toBe(true);
    expect(result.error).toContain("payload incompleto");
  });

  it("retorna error permanente si SignatureRequest no existe", async () => {
    vi.mocked(prisma.signatureRequest.findUnique).mockResolvedValue(null as never);

    const event = makeEvent();
    const result = await handleFirmaCompletada(event);

    expect(result.success).toBe(false);
    expect(result.permanent).toBe(true);
    expect(result.error).toContain("no encontrada");
  });

  it("funciona sin LegalDocument (solo retorna success)", async () => {
    vi.mocked(prisma.legalDocument.findUnique).mockResolvedValue(null as never);

    const event = makeEvent();
    const result = await handleFirmaCompletada(event);

    expect(result.success).toBe(true);
    expect(result.followUpJobs).toBeUndefined();
  });
});
