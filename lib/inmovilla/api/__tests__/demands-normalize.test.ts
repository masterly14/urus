/**
 * Tests de la normalización de demandas de Inmovilla.
 *
 * Verifican que los campos `siglas` e `inmovillaAgentId` se extraen
 * correctamente del raw de paginación para permitir la resolución de
 * comercial por Comercial.inmovillaRefCode y Comercial.inmovillaAgentId.
 */

import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Helpers de fixtures
// ---------------------------------------------------------------------------

function makeRow(fields: Array<{ campo: string; value: unknown }>) {
  return { acciones: [], fields };
}

const BASE_FIELDS = [
  { campo: "keysitu", value: "26" },
  { campo: "listipo", value: "Cliente de Portal" },
  { campo: "fechaact", value: "2026-04-12 10:00:00" },
  { campo: "ventadesde", value: "54000" },
  { campo: "ventahasta", value: "93000" },
  { campo: "habitacionmin", value: "3" },
];

function makeResponse(
  rows: Array<{
    codigo: string;
    siglas?: string;
    keyagente?: string | number;
    hasKeyagente?: boolean;
    keycli?: string | number;
    email?: string;
    telefono2?: string;
    telefono2Raw?: string;
    prefijotel2?: string | number;
  }>,
) {
  return {
    demandas: {
      demresultados: {
        info: { posicion: 0, paginacion: 10 },
        datos: rows.map(({
          codigo,
          siglas,
          keyagente,
          hasKeyagente = true,
          keycli,
          email,
          telefono2,
          telefono2Raw,
          prefijotel2,
        }) =>
          makeRow([
            { campo: "codigo", value: codigo },
            ...BASE_FIELDS,
            { campo: "usernombre", value: "Agente" },
            ...(keycli !== undefined ? [{ campo: "keycli", value: keycli }] : []),
            ...(email !== undefined ? [{ campo: "email", value: email }] : []),
            ...(telefono2 !== undefined ? [{ campo: "telefono2", value: telefono2 }] : []),
            ...(telefono2Raw !== undefined ? [{ campo: "telefono2_raw", value: telefono2Raw }] : []),
            ...(prefijotel2 !== undefined ? [{ campo: "prefijotel2", value: prefijotel2 }] : []),
            ...(siglas !== undefined ? [{ campo: "siglas", value: siglas }] : []),
            ...(hasKeyagente && keyagente !== undefined
              ? [{ campo: "keyagente", value: keyagente }]
              : []),
          ]),
        ),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Mock — se define antes del import para que vi.mock haga hoisting
// ---------------------------------------------------------------------------

const postMock = vi.fn();
const postTextMock = vi.fn();
const getClientMock = vi.fn();
const searchClientMock = vi.fn();

vi.mock("../client", () => ({
  createInmovillaClient: () => ({
    post: postMock,
    postText: postTextMock,
  }),
}));

vi.mock("../../rest/client", () => ({
  createInmovillaRestClient: () => ({}),
}));

vi.mock("../../rest/clients", () => ({
  getClient: (...args: unknown[]) => getClientMock(...args),
  searchClient: (...args: unknown[]) => searchClientMock(...args),
}));

import { fetchAllDemands } from "../demands";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("fetchAllDemands — normalización de siglas e inmovillaAgentId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INMOVILLA_DEMAND_FICHA_ENRICH = "1";
    process.env.INMOVILLA_DEMAND_PHONE_RECONCILE = "0";
    postTextMock.mockResolvedValue("");
    getClientMock.mockResolvedValue({});
    searchClientMock.mockResolvedValue([]);
  });

  it("extrae siglas en mayúsculas cuando viene del campo siglas", async () => {
    postMock.mockResolvedValueOnce(
      makeResponse([{ codigo: "001", siglas: "MA", keyagente: "177892" }]),
    );
    const demands = await fetchAllDemands({} as never);
    expect(demands[0].siglas).toBe("MA");
  });

  it("normaliza siglas a mayúsculas aunque lleguen en minúsculas", async () => {
    postMock.mockResolvedValueOnce(
      makeResponse([{ codigo: "002", siglas: "ma", keyagente: "12345" }]),
    );
    const demands = await fetchAllDemands({} as never);
    expect(demands[0].siglas).toBe("MA");
  });

  it("devuelve siglas undefined si el campo siglas es cadena vacía", async () => {
    postMock.mockResolvedValueOnce(
      makeResponse([{ codigo: "003", siglas: "", keyagente: "12345" }]),
    );
    const demands = await fetchAllDemands({} as never);
    expect(demands[0].siglas).toBeUndefined();
  });

  it("extrae inmovillaAgentId desde keyagente numérico como string", async () => {
    postMock.mockResolvedValueOnce(
      makeResponse([{ codigo: "004", siglas: "MA", keyagente: "177892" }]),
    );
    const demands = await fetchAllDemands({} as never);
    expect(demands[0].inmovillaAgentId).toBe(177892);
  });

  it("extrae inmovillaAgentId cuando keyagente llega como número", async () => {
    postMock.mockResolvedValueOnce(
      makeResponse([{ codigo: "005", siglas: "FEDE", keyagente: 55555 }]),
    );
    const demands = await fetchAllDemands({} as never);
    expect(demands[0].inmovillaAgentId).toBe(55555);
  });

  it("devuelve inmovillaAgentId undefined cuando no hay keyagente", async () => {
    postMock.mockResolvedValueOnce(
      makeResponse([{ codigo: "006", siglas: "MA", hasKeyagente: false }]),
    );
    const demands = await fetchAllDemands({} as never);
    expect(demands[0].inmovillaAgentId).toBeUndefined();
  });

  it("normaliza múltiples demandas con distintos comerciales", async () => {
    postMock.mockResolvedValueOnce(
      makeResponse([
        { codigo: "007", siglas: "MA", keyagente: "177892" },
        { codigo: "008", siglas: "FEDE", keyagente: "88888" },
        { codigo: "009", siglas: "", hasKeyagente: false },
      ]),
    );
    const demands = await fetchAllDemands({} as never);
    expect(demands).toHaveLength(3);
    expect(demands[0]).toMatchObject({ siglas: "MA", inmovillaAgentId: 177892 });
    expect(demands[1]).toMatchObject({ siglas: "FEDE", inmovillaAgentId: 88888 });
    expect(demands[2].siglas).toBeUndefined();
    expect(demands[2].inmovillaAgentId).toBeUndefined();
  });

  it("extrae refConsultada desde campo consultada (UI Inmovilla)", async () => {
    postMock.mockResolvedValueOnce({
      demandas: {
        demresultados: {
          info: { posicion: 0, paginacion: 10 },
          datos: [
            {
              acciones: [],
              fields: [
                { campo: "codigo", value: "37828509" },
                ...BASE_FIELDS,
                { campo: "consultada", value: "Ref. URUS103VMA" },
              ],
            },
          ],
        },
      },
    });
    const demands = await fetchAllDemands({} as never);
    expect(demands[0].refConsultada).toBe("URUS103VMA");
  });

  it("rellena refConsultada desde fichacliente.php si falta en el listado", async () => {
    const fichaSnippet =
      "arrficha[\"fichacliente\"][\"999\"]= new Array ('-.TABLA.-','demandas.','cod_dem','999','-.TABLA.-','demandas.','consultada','Ref. URUS111VMA');";
    postMock.mockResolvedValueOnce(
      makeResponse([{ codigo: "999", siglas: "MA", keyagente: "1" }]),
    );
    postTextMock.mockResolvedValueOnce(fichaSnippet);

    const demands = await fetchAllDemands({} as never);
    expect(demands[0].refConsultada).toBe("URUS111VMA");
    expect(postTextMock).toHaveBeenCalled();
  });

  it("reconcilia teléfono por REST /clientes cuando el listado no lo trae", async () => {
    postMock.mockResolvedValueOnce(
      makeResponse([{ codigo: "010", keycli: "123", email: "buyer@example.com" }]),
    );
    getClientMock.mockResolvedValueOnce({
      cod_cli: 123,
      telefono2: "600111222",
      prefijotel2: 34,
    });

    const demands = await fetchAllDemands({} as never, {
      fichaEnrich: { enabled: false, mode: "ref", concurrency: 1 },
      phoneReconcile: { enabled: true, maxLookups: 5, delayMs: 0 },
    });

    expect(demands[0].telefono).toBe("34600111222");
    expect(demands[0].raw?.telefono_reconciliado_fuente).toBe("rest:clientes:cod_cli");
    expect(getClientMock).toHaveBeenCalled();
    expect(searchClientMock).not.toHaveBeenCalled();
  });

  it("reconcilia teléfono por búsqueda de email si getClient no trae teléfono", async () => {
    postMock.mockResolvedValueOnce(
      makeResponse([{ codigo: "011", keycli: "456", email: "buyer2@example.com" }]),
    );
    getClientMock.mockResolvedValueOnce({
      cod_cli: 456,
      email: "buyer2@example.com",
      telefono2: "",
      prefijotel2: 34,
    });
    searchClientMock.mockResolvedValueOnce([
      {
        cod_cli: 456,
        email: "buyer2@example.com",
        telefono1: "611222333",
        prefijotel1: 34,
      },
    ]);

    const demands = await fetchAllDemands({} as never, {
      fichaEnrich: { enabled: false, mode: "ref", concurrency: 1 },
      phoneReconcile: { enabled: true, maxLookups: 5, delayMs: 0 },
    });

    expect(demands[0].telefono).toBe("34611222333");
    expect(demands[0].raw?.telefono_reconciliado_fuente).toBe("rest:clientes:buscar-email");
    expect(searchClientMock).toHaveBeenCalledWith(expect.anything(), { email: "buyer2@example.com" });
  });

  it("no consulta REST si el listado ya trae teléfono", async () => {
    postMock.mockResolvedValueOnce(
      makeResponse([
        {
          codigo: "012",
          keycli: "789",
          telefono2: "622333444",
          telefono2Raw: "34622333444",
          prefijotel2: 34,
        },
      ]),
    );

    const demands = await fetchAllDemands({} as never, {
      fichaEnrich: { enabled: false, mode: "ref", concurrency: 1 },
      phoneReconcile: { enabled: true, maxLookups: 5, delayMs: 0 },
    });

    expect(demands[0].telefono).toBe("34622333444");
    expect(getClientMock).not.toHaveBeenCalled();
    expect(searchClientMock).not.toHaveBeenCalled();
  });
});
