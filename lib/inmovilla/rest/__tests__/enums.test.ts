import { describe, it, expect, vi, beforeEach } from "vitest";
import { createInmovillaRestClient } from "../client";
import {
  getCalidades,
  getTipos,
  getTiposByTipo,
  getPaises,
  getCiudades,
  getZonas,
} from "../enums";

describe("enums (API REST Inmovilla)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  function mockFetchJson<T>(data: T) {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ "Content-Type": "application/json" }),
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(JSON.stringify(data)),
    } as Response);
  }

  it("getCalidades llama GET /enums/?calidades y devuelve array", async () => {
    const calidades = [
      { campo: "agua", valores: "true/false" },
      { campo: "alarma", valores: "true/false" },
    ];
    mockFetchJson(calidades);

    const client = createInmovillaRestClient({ token: "test-token" });
    const result = await getCalidades(client);

    expect(result).toEqual(calidades);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain("/enums/");
    expect(url).toContain("calidades");
  });

  it("getTipos llama GET /enums/?tipos y devuelve objeto con key_tipo, keyacci...", async () => {
    const tipos = {
      keyacci: [
        { nombre: "Vender", valor: 1 },
        { nombre: "Alquilar", valor: 2 },
      ],
      key_tipo: [
        { nombre: "Piso", valor: 1 },
        { nombre: "Chalet", valor: 2 },
      ],
    };
    mockFetchJson(tipos);

    const client = createInmovillaRestClient({ token: "test-token" });
    const result = await getTipos(client);

    expect(result).toEqual(tipos);
    expect(result.key_tipo).toHaveLength(2);
    expect(result.key_tipo![0].nombre).toBe("Piso");
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain("tipos");
  });

  it("getTiposByTipo llama GET /enums/?tipos=key_tipo", async () => {
    const items = [{ nombre: "Piso", valor: 1 }];
    mockFetchJson(items);

    const client = createInmovillaRestClient({ token: "test-token" });
    const result = await getTiposByTipo(client, "key_tipo");

    expect(result).toEqual(items);
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain("tipos=key_tipo");
  });

  it("getPaises llama GET /enums/?paises y devuelve array", async () => {
    const paises = [
      { pais: "España", valor: "724", iso2: "ES", iso3: "ESP" },
    ];
    mockFetchJson(paises);

    const client = createInmovillaRestClient({ token: "test-token" });
    const result = await getPaises(client);

    expect(result).toEqual(paises);
    expect(result[0].valor).toBe("724");
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain("paises");
  });

  it("getCiudades llama GET /enums/?ciudades (España por defecto)", async () => {
    const ciudades = [
      {
        provincia: "ALICANTE",
        cod_prov: 4,
        ciudades: [
          { ciudad: "Agost", key_loca: 31699 },
        ],
      },
    ];
    mockFetchJson(ciudades);

    const client = createInmovillaRestClient({ token: "test-token" });
    const result = await getCiudades(client);

    expect(result).toEqual(ciudades);
    expect(result[0].ciudades[0].key_loca).toBe(31699);
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain("ciudades");
  });

  it("getZonas llama GET /enums/?zonas=key_loca", async () => {
    const zonas: Record<string, Array<{ zona?: string; key_zona?: number }>> = {
      "31699": [
        { zona: "Partida PozoBlanco", key_zona: 2512711 },
      ],
    };
    mockFetchJson(zonas);

    const client = createInmovillaRestClient({ token: "test-token" });
    const result = await getZonas(client, 31699);

    expect(result).toEqual(zonas);
    expect(result["31699"][0].key_zona).toBe(2512711);
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain("zonas=31699");
  });

  it("getZonas con array de key_loca pasa zonas separados por coma", async () => {
    mockFetchJson({ "31699": [], "368799": [] });

    const client = createInmovillaRestClient({ token: "test-token" });
    await getZonas(client, [31699, 368799]);

    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toMatch(/zonas=31699%2C368799|zonas=31699,368799/);
  });
});
