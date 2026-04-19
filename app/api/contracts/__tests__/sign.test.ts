import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    operacion: { findFirst: vi.fn().mockResolvedValue(null) },
    legalDocument: { findFirst: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
    legalDocumentParty: { upsert: vi.fn() },
    signatureRequest: { create: vi.fn() },
  },
}));

vi.mock("@/lib/event-store/event-store", () => ({
  appendEvent: vi.fn(),
}));

vi.mock("@/lib/cloudinary", () => ({
  uploadContractDocument: vi.fn(),
}));

vi.mock("@/lib/firma", () => ({
  computeSha256: vi.fn().mockReturnValue("abc123hash"),
  generateSigningToken: vi.fn().mockReturnValue("tok.hmac"),
  buildSigningUrl: vi.fn().mockReturnValue("https://app.test/firma/tok.hmac"),
}));

import { POST } from "../sign/route";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store/event-store";
import { uploadContractDocument } from "@/lib/cloudinary";

const mockCreate = vi.mocked(prisma.signatureRequest.create);
const mockAppendEvent = vi.mocked(appendEvent);
const mockUpload = vi.mocked(uploadContractDocument);
const mockLegalDocUpsert = vi.mocked(prisma.legalDocument.upsert);
const mockPartyUpsert = vi.mocked(prisma.legalDocumentParty.upsert);

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
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth) headers.authorization = auth;
  return new Request("https://app.test/api/contracts/sign", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function stubPrisma() {
  mockCreate.mockResolvedValue({ id: "sr-1" } as never);
  mockLegalDocUpsert.mockResolvedValue({ id: "ld-1" } as never);
  mockPartyUpsert.mockResolvedValue({} as never);
  mockAppendEvent.mockResolvedValue({} as never);
}

describe("POST /api/contracts/sign (in-house firma)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    delete process.env.CRON_SECRET;
    delete process.env.SIGNATURIT_SIGN_API_TOKEN;
    delete process.env.SIGNATURIT_PDF_CONVERTER_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
    process.env.FIRMA_TOKEN_SECRET = "test-secret-64chars-0000000000000000000000000000000000000000000";
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
    stubPrisma();

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

  it("creates in-house signature with hash and token for PDF via cloudinaryUrl", async () => {
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
    stubPrisma();

    const res = await POST(makeRequest(validBody, "Bearer top-secret"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.signingUrl).toBe("https://app.test/firma/tok.hmac");
    expect(json.documentHash).toBe("abc123hash");
    expect(json.status).toBe("SENT");

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentHash: "abc123hash",
          signingToken: "tok.hmac",
          signingUrl: "https://app.test/firma/tok.hmac",
          status: "SENT",
        }),
      }),
    );
    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "FIRMA_ENVIADA" }),
    );
  });

  it("accepts docxBase64, uploads to Cloudinary, and creates in-house signature", async () => {
    mockUpload.mockResolvedValue({
      publicId: "contracts/OP-200/OP-200_arras.docx",
      secureUrl: "https://res.cloudinary.com/demo/raw/upload/contracts/OP-200/OP-200_arras.docx",
      url: "http://res.cloudinary.com/demo/raw/upload/contracts/OP-200/OP-200_arras.docx",
      bytes: 1234,
      format: "docx",
      resourceType: "raw",
      createdAt: "2026-03-25T00:00:00Z",
    });
    stubPrisma();

    const res = await POST(makeRequest(pdfBase64Body));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("SENT");
    expect(json.signingUrl).toBe("https://app.test/firma/tok.hmac");

    expect(mockUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        folder: "contracts/OP-200",
        tags: expect.arrayContaining(["pre-signature"]),
      }),
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          operationId: "OP-200",
          signerName: "Ana López",
          signerEmail: "ana@example.com",
          documentHash: "abc123hash",
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
