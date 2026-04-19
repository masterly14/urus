/**
 * Tests de integración contra la API REST real de Inmovilla.
 * Solo se ejecutan si INMOVILLA_API_TOKEN está definido.
 * Realizan llamadas reales; tener en cuenta rate limits (propiedades 10/min, clientes 20/min).
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  createInmovillaRestClient,
  getProperty,
  createProperty,
  createClient,
  searchClient,
  getClient,
} from "../index";
import type { PropiedadListadoItem } from "../types";

const hasToken = Boolean(process.env.INMOVILLA_API_TOKEN);

async function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe.skipIf(!hasToken)("Inmovilla REST API integration", () => {
  let client: ReturnType<typeof createInmovillaRestClient>;

  beforeAll(() => {
    client = createInmovillaRestClient();
  });

  it("getProperty: obtiene una propiedad por cod_ofer", async () => {
    const listado = await client.get<PropiedadListadoItem[]>("/propiedades/", {
      listado: true,
    });
    expect(Array.isArray(listado)).toBe(true);
    if (listado.length === 0) {
      return;
    }
    const cod_ofer = listado[0].cod_ofer;
    const prop = await getProperty(client, cod_ofer);
    expect(prop).toBeDefined();
    expect(prop.cod_ofer ?? prop["cod_ofer"]).toBe(cod_ofer);
    expect(prop.ref ?? prop["ref"]).toBeDefined();
  }, 15000);

  it("createClient y getClient: crea un cliente y lo obtiene por cod_cli", async () => {
    const email = `test-rest-${Date.now()}@urus-capital.integration`;
    const res = await createClient(client, {
      nombre: "Test",
      apellidos: "Integración REST",
      email,
      prefijotel2: 34,
      telefono2: 600000000 + Math.floor(Math.random() * 999999),
      nonewsletters: 0,
      gesauto: 2,
      rgpdwhats: 2,
      observacion: "Cliente de prueba tests integración",
    });
    expect(res.cod_cli).toBeDefined();
    expect(typeof res.cod_cli).toBe("number");
    expect(res.codigo).toBe(201);

    await delay(500);

    const cod_cli = res.cod_cli;
    const cliente = await getClient(client, cod_cli);
    expect(cliente).toBeDefined();
    expect(typeof cliente).toBe("object");
    // GET /clientes/?cod_cli= devuelve el cliente; estructura puede variar (cod_cli/email en raíz o anidados)
    expect(cliente.cod_cli !== undefined || cliente.email !== undefined || Object.keys(cliente).length > 0).toBe(true);
  }, 15000);

  it("searchClient: encuentra cliente por email", async () => {
    const email = `search-${Date.now()}@urus-capital.integration`;
    await createClient(client, {
      nombre: "Search",
      apellidos: "Test",
      email,
      nonewsletters: 0,
      gesauto: 2,
      rgpdwhats: 2,
    });

    await delay(500);

    const results = await searchClient(client, { email });
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThanOrEqual(1);
    const found = results.find((c) => c.email === email);
    expect(found).toBeDefined();
    expect(found?.email).toBe(email);
  }, 15000);

  it("createProperty: crea una propiedad mínima (ref única)", async () => {
    const ref = `TEST-INT-${Date.now()}`;
    const res = await createProperty(client, {
      ref,
      keyacci: 1,
      key_tipo: 3399,
      key_loca: 368799,
      precioinmo: 100000,
      nodisponible: false,
    });
    expect(res).toBeDefined();
    expect(res.codigo).toBe(201);
    expect(res.mensaje).toBeDefined();
  }, 15000);
});
