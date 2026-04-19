import { describe, it, expect, vi, beforeEach } from "vitest";
import { createInmovillaRestClient } from "../client";
import type { PropiedadListadoItem } from "../types";

const mockListado: PropiedadListadoItem[] = [
  {
    cod_ofer: 8284709,
    ref: "PR00182",
    nodisponible: false,
    prospecto: true,
    fechaact: "2018-09-20 10:12:25",
  },
];

describe("createInmovillaRestClient", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("GET /propiedades/?listado devuelve array tipado", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ "Content-Type": "application/json" }),
      json: () => Promise.resolve(mockListado),
      text: () => Promise.resolve(JSON.stringify(mockListado)),
    } as Response);

    const client = createInmovillaRestClient({ token: "test-token" });
    const data = await client.get<PropiedadListadoItem[]>("/propiedades/", {
      listado: true,
    });

    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0].cod_ofer).toBe(8284709);
    expect(data[0].ref).toBe("PR00182");
    expect(data[0].nodisponible).toBe(false);
    expect(data[0].prospecto).toBe(true);
    expect(data[0].fechaact).toBe("2018-09-20 10:12:25");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("procesos.inmovilla.com/api/v1/propiedades/");
    expect(url).toContain("listado");
    expect(init?.headers).toMatchObject({
      "Content-Type": "application/json",
      Token: "test-token",
    });
  });

  it("lanza error si no se proporciona token", () => {
    const orig = process.env.INMOVILLA_API_TOKEN;
    delete process.env.INMOVILLA_API_TOKEN;
    expect(() => createInmovillaRestClient({})).toThrow(
      "Inmovilla REST client requires token",
    );
    if (orig !== undefined) process.env.INMOVILLA_API_TOKEN = orig;
  });

  it("maneja respuesta de error de la API", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 408,
      statusText: "Request Timeout",
      headers: new Headers({ "Content-Type": "application/json" }),
      text: () =>
        Promise.resolve(JSON.stringify({ codigo: 408, mensaje: "Demasiadas peticiones" })),
      json: () =>
        Promise.resolve({ codigo: 408, mensaje: "Demasiadas peticiones" }),
    } as Response);

    const client = createInmovillaRestClient({ token: "test-token" });
    await expect(client.get("/propiedades/", { listado: true })).rejects.toThrow(
      /408|Demasiadas peticiones/,
    );
  });
});
