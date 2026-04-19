import { describe, it, expect } from "vitest";
import {
  validateDemandRecord,
  validatePaginationResponse,
  demandPaginationResponseSchema,
} from "../demand-schemas";

describe("validateDemandRecord", () => {
  it("acepta un registro válido con fields", () => {
    const raw = {
      acciones: [],
      fields: [
        { campo: "codigo", value: "123" },
        { campo: "nombre", value: "Juan" },
      ],
    };
    const result = validateDemandRecord(raw);
    expect(result).not.toBeNull();
    expect(result!.fields).toHaveLength(2);
  });

  it("acepta registro sin acciones (defaults a [])", () => {
    const raw = { fields: [{ campo: "codigo", value: "1" }] };
    const result = validateDemandRecord(raw);
    expect(result).not.toBeNull();
    expect(result!.acciones).toEqual([]);
  });

  it("rechaza registro sin fields", () => {
    const result = validateDemandRecord({ acciones: [] });
    expect(result).toBeNull();
  });

  it("rechaza registro con fields vacío", () => {
    const result = validateDemandRecord({ acciones: [], fields: [] });
    expect(result).toBeNull();
  });

  it("rechaza null/undefined/string", () => {
    expect(validateDemandRecord(null)).toBeNull();
    expect(validateDemandRecord(undefined)).toBeNull();
    expect(validateDemandRecord("string")).toBeNull();
  });

  it("rechaza fields con campo faltante", () => {
    const result = validateDemandRecord({
      fields: [{ value: "sin campo" }],
    });
    expect(result).toBeNull();
  });
});

describe("validatePaginationResponse", () => {
  const validResponse = {
    demandas: {
      demresultados: {
        info: {
          vista: "demandas",
          ficha: "demandas",
          data: "demresultados",
          tipopag: "",
          posicion: 0,
          paginacion: 10,
          pagactual: 1,
          campos: {},
        },
        datos: [
          { acciones: [], fields: [{ campo: "codigo", value: "100" }] },
          { acciones: [], fields: [{ campo: "codigo", value: "200" }] },
        ],
      },
    },
  };

  it("valida respuesta completa correctamente", () => {
    const { info, rawRecords } = validatePaginationResponse(validResponse);
    expect(info.paginacion).toBe(10);
    expect(rawRecords).toHaveLength(2);
  });

  it("acepta paginacion como string", () => {
    const response = {
      demandas: {
        demresultados: {
          info: { paginacion: "10" },
          datos: [],
        },
      },
    };
    const { info } = validatePaginationResponse(response);
    expect(info.paginacion).toBe("10");
  });

  it("lanza si falta demandas.demresultados", () => {
    expect(() => validatePaginationResponse({})).toThrow(
      /Respuesta de paginación de demandas inválida/,
    );
  });

  it("lanza si demandas es null", () => {
    expect(() => validatePaginationResponse({ demandas: null })).toThrow();
  });

  it("acepta respuesta con info parcial (defaults)", () => {
    const minimal = {
      demandas: {
        demresultados: {
          info: {},
          datos: [],
        },
      },
    };
    const { info } = validatePaginationResponse(minimal);
    expect(info.paginacion).toBe(10);
    expect(info.posicion).toBe(0);
  });

  it("acepta info.campos como mapa string → metadatos (API Inmovilla real)", () => {
    const withCampos = {
      demandas: {
        demresultados: {
          info: {
            paginacion: 10,
            campos: {
              codigo: { pos: 0, ancho: 80, titulo: "Código" },
              nombre: { pos: 1 },
            },
          },
          datos: [],
        },
      },
    };
    const { info } = validatePaginationResponse(withCampos);
    expect(info.campos.codigo).toEqual({
      pos: 0,
      ancho: 80,
      titulo: "Código",
    });
  });

  it("acepta datos como objeto con claves de índice global (pág. 2+ Inmovilla)", () => {
    const row10 = {
      acciones: [],
      fields: [{ campo: "codigo", value: "a" }],
    };
    const row11 = {
      acciones: [],
      fields: [{ campo: "codigo", value: "b" }],
    };
    const response = {
      demandas: {
        demresultados: {
          info: { posicion: 10, paginacion: "10" },
          datos: { "11": row11, "10": row10 },
        },
      },
    };
    const { rawRecords } = validatePaginationResponse(response);
    expect(rawRecords).toEqual([row10, row11]);
  });
});

describe("demandPaginationResponseSchema edge cases", () => {
  it("datos vacío defaultea a []", () => {
    const res = demandPaginationResponseSchema.safeParse({
      demandas: {
        demresultados: {
          info: {},
        },
      },
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.demandas.demresultados.datos).toEqual([]);
    }
  });
});
