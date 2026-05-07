import { describe, expect, it, vi } from "vitest";
import { unlockUrl } from "../client";

function buildResponse(args: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  body?: string;
  headers?: Record<string, string>;
}): Response {
  const headers = new Map<string, string>(Object.entries(args.headers ?? {}));
  return {
    ok: args.ok ?? true,
    status: args.status ?? 200,
    statusText: args.statusText ?? "OK",
    headers: {
      get: (name: string) => headers.get(name.toLowerCase()) ?? null,
    },
    text: async () => args.body ?? "",
  } as unknown as Response;
}

describe("unlockUrl", () => {
  it("envía POST /request con Authorization Bearer y body JSON correcto", async () => {
    const fetchImpl = vi.fn(async () => buildResponse({ body: "<html>ok</html>" })) as unknown as typeof fetch;
    const result = await unlockUrl({
      url: "https://www.idealista.com/inmueble/1/",
      zone: "urus_unlocker",
      apiToken: "secret",
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.html).toBe("<html>ok</html>");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [endpoint, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(endpoint).toBe("https://api.brightdata.com/request");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer secret",
      "Content-Type": "application/json",
    });
    const parsedBody = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
    expect(parsedBody).toEqual({
      zone: "urus_unlocker",
      url: "https://www.idealista.com/inmueble/1/",
      format: "raw",
    });
  });

  it("incluye method/body/country opcionales cuando se pasan", async () => {
    const fetchImpl = vi.fn(async () => buildResponse({ body: "" })) as unknown as typeof fetch;
    await unlockUrl({
      url: "https://example.com",
      zone: "urus_unlocker",
      apiToken: "x",
      fetchImpl,
      method: "POST",
      body: '{"k":"v"}',
      country: "es",
    });
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit;
    const parsed = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(parsed).toMatchObject({ method: "POST", body: '{"k":"v"}', country: "es" });
  });

  it("propaga código de error y mensaje cuando la API responde !ok con JSON", async () => {
    const fetchImpl = vi.fn(async () =>
      buildResponse({
        ok: false,
        status: 422,
        statusText: "Unprocessable",
        body: JSON.stringify({ error: { code: "invalid_zone", message: "Zone urus_unlocker not found" } }),
      }),
    ) as unknown as typeof fetch;

    const result = await unlockUrl({
      url: "https://example.com",
      zone: "urus_unlocker",
      apiToken: "secret",
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(422);
      expect(result.errorCode).toBe("invalid_zone");
      expect(result.errorMessage).toContain("Zone urus_unlocker not found");
    }
  });

  it("usa el texto plano de la respuesta cuando no es JSON", async () => {
    const fetchImpl = vi.fn(async () =>
      buildResponse({ ok: false, status: 401, body: "Unauthorized: bad token" }),
    ) as unknown as typeof fetch;

    const result = await unlockUrl({
      url: "https://example.com",
      zone: "z",
      apiToken: "x",
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.errorMessage).toBe("Unauthorized: bad token");
    }
  });

  it("captura excepciones de red sin lanzar", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const result = await unlockUrl({
      url: "https://example.com",
      zone: "z",
      apiToken: "x",
      fetchImpl,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBeUndefined();
      expect(result.errorMessage).toBe("network down");
    }
  });

  it("expone finalUrl y contentType si la API los devuelve en headers", async () => {
    const fetchImpl = vi.fn(async () =>
      buildResponse({
        body: "<html>data</html>",
        headers: {
          "x-final-url": "https://www.idealista.com/inmueble/1/galeria",
          "content-type": "text/html; charset=utf-8",
        },
      }),
    ) as unknown as typeof fetch;

    const result = await unlockUrl({
      url: "https://www.idealista.com/inmueble/1/",
      zone: "urus_unlocker",
      apiToken: "x",
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.finalUrl).toBe("https://www.idealista.com/inmueble/1/galeria");
      expect(result.contentType).toBe("text/html; charset=utf-8");
      expect(result.blocked).toBe(false);
      expect(result.blockedReason).toBeUndefined();
    }
  });

  it("clasifica como blocked=datadome cuando el body es la pagina de bloqueo real de DataDome (idealista, capturada 06/05/2026)", async () => {
    // Snippet real de la respuesta 403 que devuelve Idealista cuando bloquea
    // (curl con UA naive). Sin Web Unlocker el body es ~773 bytes con esto:
    const realDataDomeBody =
      `<html lang="es"><head><title>idealista.com</title></head>` +
      `<body><p id="cmsg">Please enable JS and disable any ad blocker</p>` +
      `<script data-cfasync="false">var dd={'rt':'c','cid':'AHrlqAAAAAMA...','hsh':'AC81AADC3279CA4C7B968B717FBB30','t':'bv','host':'geo.captcha-delivery.com'}</script>` +
      `<script data-cfasync="false" src="https://ct.captcha-delivery.com/c.js"></script>` +
      `</body></html>`;
    const fetchImpl = vi.fn(async () =>
      buildResponse({ body: realDataDomeBody, headers: { "content-type": "text/html" } }),
    ) as unknown as typeof fetch;

    const result = await unlockUrl({
      url: "https://www.idealista.com/venta-viviendas/cordoba-cordoba/",
      zone: "web_unlocker_market",
      apiToken: "x",
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.blocked).toBe(true);
      expect(result.blockedReason).toBe("datadome");
    }
  });

  it("NO clasifica como blocked el tag defensivo dd.idealista.com/tags.js (presente en cada pagina normal)", async () => {
    // Este es el tag que Idealista carga SIEMPRE como defensa pasiva.
    // Una pagina normal de listado pesa ~370 KB e incluye el tag.
    const fakeListingPage = "<html>" + "x".repeat(40_000) +
      "<script>window.ddjskey = 'AC81';</script>" +
      "<script src='https://dd.idealista.com/tags.js' async></script>" +
      "<a href='/inmueble/106437218/'>Piso</a>" +
      "</html>";
    const fetchImpl = vi.fn(async () =>
      buildResponse({ body: fakeListingPage }),
    ) as unknown as typeof fetch;

    const result = await unlockUrl({
      url: "https://www.idealista.com/venta-viviendas/cordoba-cordoba/",
      zone: "z",
      apiToken: "x",
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.blocked).toBe(false);
    }
  });

  it("clasifica como blocked=http_403 cuando x-final-status indica 403", async () => {
    const fetchImpl = vi.fn(async () =>
      buildResponse({
        body: "<html>403 Forbidden</html>",
        headers: { "x-final-status": "403" },
      }),
    ) as unknown as typeof fetch;

    const result = await unlockUrl({
      url: "https://www.idealista.com/venta-viviendas/cordoba-cordoba/",
      zone: "web_unlocker_market",
      apiToken: "x",
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.blocked).toBe(true);
      expect(result.blockedReason).toBe("http_403");
    }
  });

  it("clasifica como blocked=uso_indebido cuando el body contiene el mensaje de Idealista", async () => {
    const fetchImpl = vi.fn(async () =>
      buildResponse({
        body: "<html>Hemos detectado un uso indebido de la aplicacion</html>",
      }),
    ) as unknown as typeof fetch;

    const result = await unlockUrl({
      url: "https://www.idealista.com/",
      zone: "z",
      apiToken: "x",
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.blocked).toBe(true);
      expect(result.blockedReason).toBe("uso_indebido");
    }
  });

  it("HTML legitimo (sin marcadores) no se marca como blocked", async () => {
    const fetchImpl = vi.fn(async () =>
      buildResponse({
        body: "<!DOCTYPE html><html><body><a href=\"/inmueble/1/\">Piso</a></body></html>",
      }),
    ) as unknown as typeof fetch;

    const result = await unlockUrl({
      url: "https://www.idealista.com/",
      zone: "z",
      apiToken: "x",
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.blocked).toBe(false);
    }
  });
});
