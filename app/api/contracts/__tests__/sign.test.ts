import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    signatureRequest: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/event-store/event-store", () => ({
  appendEvent: vi.fn(),
}));

vi.mock("@/lib/signaturit", () => ({
  createSignaturitClient: vi.fn(),
}));

vi.mock("@/lib/cloudinary", () => ({
  uploadContractDocument: vi.fn(),
}));

import { POST } from "../sign/route";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store/event-store";
import { createSignaturitClient } from "@/lib/signaturit";
import { uploadContractDocument } from "@/lib/cloudinary";

const mockCreate = vi.mocked(prisma.signatureRequest.create);
const mockAppendEvent = vi.mocked(appendEvent);
const mockCreateClient = vi.mocked(createSignaturitClient);
const mockUpload = vi.mocked(uploadContractDocument);

const validBody = {
  operationId: "OP-100",
  propertyCode: "P-100",
  documentKind: "arras",
  templateVersion: "OP-100_Arras_v2",
  cloudinaryUrl: "https://res.cloudinary.com/demo/raw/upload/contracts/test.pdf",
  signers: [{ name: "Julio", email: "julio@example.com", phone: "34611111111" }],
  signingMode: "sequential",
};

const pdfBase64Body = {
  operationId: "OP-200",
  propertyCode: "P-200",
  documentKind: "arras",
  templateVersion: "OP-200_Arras_v1",
  docxBase64: Buffer.from("%PDF-1.7 mock content").toString("base64"),
  signers: [{ name: "Ana López", email: "ana@example.com" }],
};

function makeRequest(body: unknown, auth?: string): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (auth) headers.authorization = auth;
  return new Request("https://app.test/api/contracts/sign", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function stubSignaturitClient() {
  const createSignatureRequest = vi.fn().mockResolvedValue({
    id: "sig-123",
    created_at: "2026-03-25T00:00:00+0000",
    data: {},
    documents: [
      {
        id: "doc-123",
        email: "julio@example.com",
        name: "Julio",
        status: "ready",
        url: "https://signaturit.app/s/abc",
        events: [],
        file: { name: "op100_arras.pdf", pages: 2, size: 11111 },
      },
    ],
  });
  mockCreateClient.mockReturnValue({
    createSignatureRequest,
    getSignature: vi.fn(),
    downloadSignedDocument: vi.fn(),
    downloadAuditTrail: vi.fn(),
    cancelSignature: vi.fn(),
  });
  return createSignatureRequest;
}

function stubPrismaAndEvents() {
  mockCreate.mockResolvedValue({
    id: "sr-1",
    signaturitSignatureId: "sig-123",
  } as never);
  mockAppendEvent.mockResolvedValue({} as never);
}

describe("POST /api/contracts/sign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    delete process.env.CRON_SECRET;
    delete process.env.SIGNATURIT_SIGN_API_TOKEN;
    delete process.env.SIGNATURIT_PDF_CONVERTER_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
  });

  it("returns 401 when token is configured but missing/invalid", async () => {
    process.env.SIGNATURIT_SIGN_API_TOKEN = "top-secret";
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(401);
  });

  it("allows unauthenticated requests when no auth tokens are configured", async () => {
    const pdfBuffer = Buffer.from("%PDF-1.7 mock");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/pdf" }),
        arrayBuffer: () => Promise.resolve(pdfBuffer.buffer),
      } as Response),
    );
    stubSignaturitClient();
    stubPrismaAndEvents();

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
  });

  it("returns 422 when input file is not PDF and converter is unavailable", async () => {
    process.env.SIGNATURIT_SIGN_API_TOKEN = "top-secret";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/octet-stream" }),
        arrayBuffer: () => Promise.resolve(Buffer.from("not-pdf").buffer),
      } as Response),
    );

    const res = await POST(makeRequest(validBody, "Bearer top-secret"));
    const json = await res.json();
    expect(res.status).toBe(422);
    expect(json.code).toBe("PDF_CONVERSION_UNAVAILABLE");
  });

  it("sends signature request and persists sent state for PDF input via cloudinaryUrl", async () => {
    process.env.SIGNATURIT_SIGN_API_TOKEN = "top-secret";
    const pdfBuffer = Buffer.from("%PDF-1.7 mock");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/pdf" }),
        arrayBuffer: () => Promise.resolve(pdfBuffer.buffer),
      } as Response),
    );

    const createSigReq = stubSignaturitClient();
    stubPrismaAndEvents();

    const res = await POST(makeRequest(validBody, "Bearer top-secret"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.signaturitSignatureId).toBe("sig-123");
    expect(json.signaturitDocumentId).toBe("doc-123");

    expect(createSigReq).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryType: "url",
        eventsUrl: "https://app.test/api/signaturit/webhook.json",
      }),
    );
    expect(mockCreate).toHaveBeenCalled();
    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "FIRMA_ENVIADA" }),
    );
  });

  it("accepts docxBase64, uploads to Cloudinary, and sends to Signaturit", async () => {
    mockUpload.mockResolvedValue({
      publicId: "contracts/OP-200/OP-200_arras.docx",
      secureUrl: "https://res.cloudinary.com/demo/raw/upload/contracts/OP-200/OP-200_arras.docx",
      url: "http://res.cloudinary.com/demo/raw/upload/contracts/OP-200/OP-200_arras.docx",
      bytes: 1234,
      format: "docx",
      resourceType: "raw",
      createdAt: "2026-03-25T00:00:00Z",
    });

    const createSigReq = stubSignaturitClient();
    stubPrismaAndEvents();

    const res = await POST(makeRequest(pdfBase64Body));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("SENT");
    expect(json.signaturitSignatureId).toBe("sig-123");

    expect(mockUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        folder: "contracts/OP-200",
        tags: expect.arrayContaining(["pre-signature"]),
      }),
    );

    expect(createSigReq).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: "OP-200_arras.pdf",
        deliveryType: "url",
      }),
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cloudinaryUrl: expect.stringContaining("cloudinary.com"),
          operationId: "OP-200",
          signerName: "Ana López",
          signerEmail: "ana@example.com",
        }),
      }),
    );
  });

  it("returns 400 when neither cloudinaryUrl nor docxBase64 is provided", async () => {
    const body = {
      operationId: "OP-100",
      propertyCode: "P-100",
      documentKind: "arras",
      signers: [{ name: "Test", email: "test@example.com" }],
    };
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
  });

  it("returns 502 when Cloudinary upload fails for docxBase64", async () => {
    mockUpload.mockRejectedValue(new Error("Cloudinary timeout"));

    const res = await POST(makeRequest(pdfBase64Body));
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.error).toContain("Cloudinary");
  });
});
