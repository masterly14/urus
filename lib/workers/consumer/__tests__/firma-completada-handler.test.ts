import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EventRecord } from "@/lib/event-store/types";
import { handleFirmaCompletada } from "../firma-completada-handler";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    signatureRequest: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    legalDocument: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    legalDocumentParty: {
      updateMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("@/lib/signaturit", () => ({
  createSignaturitClient: vi.fn(),
}));

vi.mock("@/lib/cloudinary", () => ({
  uploadContractDocument: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { createSignaturitClient } from "@/lib/signaturit";
import { uploadContractDocument } from "@/lib/cloudinary";

const mockSignaturitClient = {
  downloadSignedDocument: vi.fn(),
  downloadAuditTrail: vi.fn(),
  createSignatureRequest: vi.fn(),
  getSignature: vi.fn(),
  cancelSignature: vi.fn(),
};

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
      signaturitSignatureId: "sig-ext-001",
      signaturitDocumentId: "doc-ext-001",
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
  signaturitSignatureId: "sig-ext-001",
  signaturitDocumentId: "doc-ext-001",
  operationId: "OP-2026-001",
  propertyCode: "P-100",
  documentKind: "arras",
  templateVersion: "OP-2026-001_Arras_v1",
  cloudinaryUrl: "https://res.cloudinary.com/draft.docx",
  status: "COMPLETED",
};

const MOCK_LEGAL_DOC = {
  id: "ldoc-001",
  operationId: "OP-2026-001",
  propertyCode: "P-100",
  documentKind: "arras",
  signatureRequestId: "sigreq-001",
  status: "SENT_TO_SIGNATURE",
};

describe("handleFirmaCompletada", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createSignaturitClient).mockReturnValue(mockSignaturitClient);
    mockSignaturitClient.downloadSignedDocument.mockResolvedValue(
      Buffer.from("%PDF-signed"),
    );
    mockSignaturitClient.downloadAuditTrail.mockResolvedValue(
      Buffer.from("%PDF-audit"),
    );
    vi.mocked(uploadContractDocument)
      .mockResolvedValueOnce({
        publicId: "contracts/OP-2026-001/signed/OP-2026-001_signed.pdf",
        secureUrl: "https://res.cloudinary.com/signed.pdf",
        url: "http://res.cloudinary.com/signed.pdf",
        bytes: 1024,
        format: "pdf",
        resourceType: "raw",
        createdAt: "2026-03-27T10:00:00Z",
      })
      .mockResolvedValueOnce({
        publicId: "contracts/OP-2026-001/audit/OP-2026-001_audit_trail.pdf",
        secureUrl: "https://res.cloudinary.com/audit.pdf",
        url: "http://res.cloudinary.com/audit.pdf",
        bytes: 512,
        format: "pdf",
        resourceType: "raw",
        createdAt: "2026-03-27T10:00:00Z",
      });
    vi.mocked(prisma.signatureRequest.findUnique).mockResolvedValue(
      MOCK_SIG_REQ as never,
    );
    vi.mocked(prisma.signatureRequest.update).mockResolvedValue(
      MOCK_SIG_REQ as never,
    );
    vi.mocked(prisma.legalDocument.findUnique).mockResolvedValue(
      MOCK_LEGAL_DOC as never,
    );
    vi.mocked(prisma.legalDocument.update).mockResolvedValue(
      MOCK_LEGAL_DOC as never,
    );
    vi.mocked(prisma.legalDocumentParty.updateMany).mockResolvedValue({
      count: 1,
    } as never);
    vi.mocked(prisma.legalDocumentParty.count).mockResolvedValue(0 as never);
  });

  it("happy path: descarga, sube a Cloudinary, actualiza LegalDocument y encola egestión", async () => {
    const event = makeEvent();
    const result = await handleFirmaCompletada(event);

    expect(result.success).toBe(true);

    expect(mockSignaturitClient.downloadSignedDocument).toHaveBeenCalledWith(
      "sig-ext-001",
      "doc-ext-001",
    );
    expect(mockSignaturitClient.downloadAuditTrail).toHaveBeenCalledWith(
      "sig-ext-001",
      "doc-ext-001",
    );

    expect(uploadContractDocument).toHaveBeenCalledTimes(2);

    expect(prisma.signatureRequest.update).toHaveBeenCalledWith({
      where: { id: "sigreq-001" },
      data: {
        signedDocumentUrl: "https://res.cloudinary.com/signed.pdf",
        auditTrailUrl: "https://res.cloudinary.com/audit.pdf",
      },
    });

    expect(prisma.legalDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ldoc-001" },
        data: expect.objectContaining({
          status: "SIGNED",
          signedDocumentUrl: "https://res.cloudinary.com/signed.pdf",
          auditTrailUrl: "https://res.cloudinary.com/audit.pdf",
        }),
      }),
    );

    expect(prisma.legalDocumentParty.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { legalDocumentId: "ldoc-001", hasSigned: false },
      }),
    );

    expect(result.followUpJobs).toHaveLength(1);
    expect(result.followUpJobs![0].type).toBe("WRITE_TO_INMOVILLA");
    expect(result.followUpJobs![0].idempotencyKey).toBe(
      "write_inmovilla_post_firma:OP-2026-001",
    );
  });

  it("retorna error permanente si el payload es incompleto", async () => {
    const event = makeEvent({
      signatureRequestId: undefined,
      signaturitSignatureId: undefined,
    });
    event.payload = { operationId: "OP-001" };

    const result = await handleFirmaCompletada(event);

    expect(result.success).toBe(false);
    expect(result.permanent).toBe(true);
    expect(result.error).toContain("payload incompleto");
  });

  it("retorna error permanente si SignatureRequest no existe", async () => {
    vi.mocked(prisma.signatureRequest.findUnique).mockResolvedValue(
      null as never,
    );

    const event = makeEvent();
    const result = await handleFirmaCompletada(event);

    expect(result.success).toBe(false);
    expect(result.permanent).toBe(true);
    expect(result.error).toContain("no encontrada");
  });

  it("propaga error de Signaturit (retriable)", async () => {
    mockSignaturitClient.downloadSignedDocument.mockRejectedValue(
      new Error("Signaturit downloadSignedDocument failed (500): Internal"),
    );

    const event = makeEvent();
    await expect(handleFirmaCompletada(event)).rejects.toThrow(
      "Signaturit downloadSignedDocument failed",
    );
  });

  it("propaga error de Cloudinary (retriable)", async () => {
    vi.mocked(uploadContractDocument)
      .mockReset()
      .mockRejectedValue(new Error("Cloudinary upload timeout"));

    const event = makeEvent();
    await expect(handleFirmaCompletada(event)).rejects.toThrow(
      "Cloudinary upload timeout",
    );
  });

  it("no encola egestión si quedan parties sin firmar", async () => {
    vi.mocked(prisma.legalDocumentParty.count).mockResolvedValue(1 as never);

    const event = makeEvent();
    const result = await handleFirmaCompletada(event);

    expect(result.success).toBe(true);
    expect(result.followUpJobs).toBeUndefined();
  });

  it("funciona sin LegalDocument (solo actualiza SignatureRequest)", async () => {
    vi.mocked(prisma.legalDocument.findUnique).mockResolvedValue(null as never);

    const event = makeEvent();
    const result = await handleFirmaCompletada(event);

    expect(result.success).toBe(true);
    expect(prisma.signatureRequest.update).toHaveBeenCalled();
    expect(prisma.legalDocument.update).not.toHaveBeenCalled();
    expect(result.followUpJobs).toBeUndefined();
  });
});
