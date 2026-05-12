import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWabaTemplatesClient } from "../meta-client";

describe("createWabaTemplatesClient", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.WHATSAPP_ACCESS_TOKEN = "token-test";
    process.env.WHATSAPP_BUSINESS_ID = "waba-test";
  });

  it("crea plantilla en Meta usando POST /message_templates", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () =>
        Promise.resolve({
          id: "123456",
          status: "PENDING",
          category: "UTILITY",
        }),
    } as Response);

    const client = createWabaTemplatesClient();
    const created = await client.createTemplate({
      name: "postventa_nueva",
      language: "es_ES",
      category: "UTILITY",
      components: [{ type: "BODY", text: "Hola {{1}}" }],
    });

    expect(created).toEqual({
      id: "123456",
      status: "PENDING",
      category: "UTILITY",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/v20.0/waba-test/message_templates");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer token-test",
      "Content-Type": "application/json",
    });
  });

  it("propaga errores de Meta al crear plantilla", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: () =>
        Promise.resolve({
          error: {
            code: 100,
            message: "Invalid parameter",
          },
        }),
    } as Response);

    const client = createWabaTemplatesClient();
    await expect(
      client.createTemplate({
        name: "invalid_name",
        language: "es_ES",
        category: "UTILITY",
        components: [{ type: "BODY", text: "" }],
      }),
    ).rejects.toThrow("Meta API error 100: Invalid parameter");
  });
});
