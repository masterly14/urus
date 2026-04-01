import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSignaturitClient } from "../client";

describe("createSignaturitClient", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("throws if no access token is provided", () => {
    delete process.env.SIGNATURIT_ACCESS_TOKEN;
    expect(() => createSignaturitClient({ accessToken: "" })).toThrow(
      "SIGNATURIT_ACCESS_TOKEN is required",
    );
  });

  it("createSignatureRequest sends multipart POST and returns response", async () => {
    const fetchMock = vi.mocked(fetch);
    const mockResponse = {
      id: "sig-123",
      created_at: "2026-03-25T10:00:00+0000",
      data: { operationId: "OP-001" },
      documents: [
        {
          id: "doc-456",
          email: "signer@example.com",
          name: "John",
          status: "in_queue" as const,
          url: "https://app.signaturit.com/sign/abc",
          events: [],
          file: { name: "contract.pdf", pages: 3, size: 120000 },
        },
      ],
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const client = createSignaturitClient({
      accessToken: "test-token",
      apiUrl: "https://api.sandbox.signaturit.com/v3",
    });

    const result = await client.createSignatureRequest({
      file: Buffer.from("fake-pdf"),
      fileName: "contract.pdf",
      recipients: [{ name: "John", email: "signer@example.com", phone: "34600000000" }],
      eventsUrl: "https://myapp.com/api/signaturit/webhook.json",
      deliveryType: "url",
      expireTime: 30,
      name: "OP-001 — arras",
      data: { operationId: "OP-001", propertyCode: "P-100", documentKind: "arras" },
    });

    expect(result.id).toBe("sig-123");
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].url).toBe("https://app.signaturit.com/sign/abc");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://api.sandbox.signaturit.com/v3/signatures.json",
    );
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer test-token",
    });
    expect(init?.body).toBeInstanceOf(FormData);
  });

  it("createSignatureRequest throws on non-ok response", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: () => Promise.resolve("Validation error"),
    } as Response);

    const client = createSignaturitClient({ accessToken: "test-token" });

    await expect(
      client.createSignatureRequest({
        file: Buffer.from("fake-pdf"),
        fileName: "test.pdf",
        recipients: [{ name: "A", email: "a@b.com" }],
      }),
    ).rejects.toThrow("Signaturit createSignatureRequest failed (422)");
  });

  it("getSignature fetches a signature by id", async () => {
    const fetchMock = vi.mocked(fetch);
    const mockSig = {
      id: "sig-789",
      created_at: "2026-03-25T10:00:00+0000",
      data: {},
      documents: [],
    };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSig),
    } as Response);

    const client = createSignaturitClient({
      accessToken: "tok",
      apiUrl: "https://api.sandbox.signaturit.com/v3",
    });
    const result = await client.getSignature("sig-789");

    expect(result.id).toBe("sig-789");
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/signatures/sig-789.json");
  });

  it("downloadSignedDocument returns a Buffer", async () => {
    const fetchMock = vi.mocked(fetch);
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(pdfBytes.buffer),
    } as Response);

    const client = createSignaturitClient({ accessToken: "tok" });
    const buf = await client.downloadSignedDocument("sig-1", "doc-2");

    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf[0]).toBe(0x25); // %PDF
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/signatures/sig-1/documents/doc-2/download/signed");
  });

  it("cancelSignature sends PATCH", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({ ok: true } as Response);

    const client = createSignaturitClient({ accessToken: "tok" });
    await client.cancelSignature("sig-cancel");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/signatures/sig-cancel/cancel.json");
    expect(init?.method).toBe("PATCH");
  });
});
