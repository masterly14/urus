import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    signatureRequest: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/event-store/event-store", () => ({
  appendEvent: vi.fn(),
}));

import { handleSignaturitWebhookPost } from "@/lib/signaturit/handle-webhook-post";
import { POST as POSTWebhook } from "../webhook/route";
import { POST as POSTWebhookJson } from "../webhook.json/route";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store/event-store";

const mockFindFirst = vi.mocked(prisma.signatureRequest.findFirst);
const mockUpdate = vi.mocked(prisma.signatureRequest.update);
const mockAppendEvent = vi.mocked(appendEvent);

function makeRequest(body: unknown, ip?: string): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (ip) headers["x-forwarded-for"] = ip;

  return new Request("https://app.test/api/signaturit/webhook.json", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const baseSigRequest = {
  id: "sr-001",
  signaturitSignatureId: "sig-abc",
  signaturitDocumentId: "doc-xyz",
  operationId: "OP-001",
  propertyCode: "P-100",
  documentKind: "arras",
  status: "SENT",
};

describe("handleSignaturitWebhookPost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SIGNATURIT_WEBHOOK_ALLOWED_IP;
  });

  it("ignores unmapped event types", async () => {
    const res = await handleSignaturitWebhookPost(
      makeRequest({ type: "email_processed", document: { id: "doc-xyz" } }),
    );
    const json = await res.json();
    expect(json.ignored).toBe(true);
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("returns 400 for missing document.id", async () => {
    const res = await handleSignaturitWebhookPost(
      makeRequest({ type: "document_completed" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns matched=false when no SignatureRequest found", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    const res = await handleSignaturitWebhookPost(
      makeRequest({
        type: "document_completed",
        document: { id: "doc-unknown" },
      }),
    );
    const json = await res.json();
    expect(json.matched).toBe(false);
  });

  it("updates status to COMPLETED on document_completed", async () => {
    mockFindFirst.mockResolvedValueOnce(baseSigRequest as never);
    mockUpdate.mockResolvedValueOnce({} as never);
    mockAppendEvent.mockResolvedValueOnce({} as never);

    const res = await handleSignaturitWebhookPost(
      makeRequest({
        type: "document_completed",
        document: { id: "doc-xyz", status: "completed" },
        created_at: "2026-03-25T15:00:00+0000",
      }),
    );
    const json = await res.json();
    expect(json.status).toBe("COMPLETED");

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sr-001" },
        data: expect.objectContaining({ status: "COMPLETED" }),
      }),
    );

    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "FIRMA_COMPLETADA",
        aggregateType: "PROPERTY",
        aggregateId: "P-100",
      }),
    );
  });

  it("updates status to DECLINED on document_declined", async () => {
    mockFindFirst.mockResolvedValueOnce(baseSigRequest as never);
    mockUpdate.mockResolvedValueOnce({} as never);
    mockAppendEvent.mockResolvedValueOnce({} as never);

    const res = await handleSignaturitWebhookPost(
      makeRequest({
        type: "document_declined",
        document: { id: "doc-xyz" },
      }),
    );
    const json = await res.json();
    expect(json.status).toBe("DECLINED");

    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "FIRMA_RECHAZADA" }),
    );
  });

  it("is idempotent for terminal statuses", async () => {
    mockFindFirst.mockResolvedValueOnce({
      ...baseSigRequest,
      status: "COMPLETED",
    } as never);

    const res = await handleSignaturitWebhookPost(
      makeRequest({
        type: "document_completed",
        document: { id: "doc-xyz" },
      }),
    );
    const json = await res.json();
    expect(json.idempotent).toBe(true);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });

  it("updates status to OPENED without emitting a domain event", async () => {
    mockFindFirst.mockResolvedValueOnce(baseSigRequest as never);
    mockUpdate.mockResolvedValueOnce({} as never);

    const res = await handleSignaturitWebhookPost(
      makeRequest({
        type: "document_opened",
        document: { id: "doc-xyz" },
      }),
    );
    const json = await res.json();
    expect(json.status).toBe("OPENED");
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });

  it("updates status to EXPIRED on document_expired", async () => {
    mockFindFirst.mockResolvedValueOnce(baseSigRequest as never);
    mockUpdate.mockResolvedValueOnce({} as never);
    mockAppendEvent.mockResolvedValueOnce({} as never);

    const res = await handleSignaturitWebhookPost(
      makeRequest({
        type: "document_expired",
        document: { id: "doc-xyz" },
      }),
    );
    const json = await res.json();
    expect(json.status).toBe("EXPIRED");
    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "FIRMA_EXPIRADA" }),
    );
  });
});

describe("API routes delegate to handleSignaturitWebhookPost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SIGNATURIT_WEBHOOK_ALLOWED_IP;
  });

  it("POST /api/signaturit/webhook matches shared handler", async () => {
    mockFindFirst.mockResolvedValueOnce(baseSigRequest as never);
    mockUpdate.mockResolvedValueOnce({} as never);

    const res = await POSTWebhook(
      makeRequest({ type: "document_opened", document: { id: "doc-xyz" } }),
    );
    const json = await res.json();
    expect(json.status).toBe("OPENED");
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("POST /api/signaturit/webhook.json matches shared handler", async () => {
    mockFindFirst.mockResolvedValueOnce(baseSigRequest as never);
    mockUpdate.mockResolvedValueOnce({} as never);

    const res = await POSTWebhookJson(
      makeRequest({ type: "document_opened", document: { id: "doc-xyz" } }),
    );
    const json = await res.json();
    expect(json.status).toBe("OPENED");
    expect(mockUpdate).toHaveBeenCalled();
  });
});
