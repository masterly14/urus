import { describe, expect, it } from "vitest";
import { buildContractTemplateInput } from "../build-contract-input";
import type { ExtractionDeps } from "../shared";

function createMockDeps(overrides?: Partial<ExtractionDeps>): ExtractionDeps {
  return {
    getDemandFromNeon: async () => ({
      codigo: "DEM-1",
      nombre: "Ana Compradora",
      raw: { keycli: "101" },
    }),
    getPropertyFromNeon: async () => ({
      codigo: "1001",
      ciudad: "Cordoba",
      titulo: "Vivienda Centro",
      raw: { keycli: "202", propietario: "Jose Vendedor" },
    }),
    getInmovillaProperty: async () => ({
      cod_ofer: 1001,
      keycli: 202,
      calle: "Calle Mayor",
      numero: 12,
      localidad: "Cordoba",
      refcat: "1234567UH1233S0001AB",
      finca: "F-200",
    }),
    getInmovillaClient: async (clientCode: number) => {
      if (clientCode === 101) {
        return {
          cod_cli: 101,
          nombre: "Ana",
          apellidos: "Compradora Ruiz",
          nif: "12345678A",
          calle: "Calle Sol",
          numero: "1",
          cp: "14001",
          localidad: "Cordoba",
          provincia: "Cordoba",
        };
      }
      if (clientCode === 202) {
        return {
          cod_cli: 202,
          nombre: "Jose",
          apellidos: "Vendedor Lopez",
          nif: "87654321B",
          calle: "Avenida Luna",
          numero: "5",
          cp: "14002",
          localidad: "Cordoba",
          provincia: "Cordoba",
        };
      }
      return null;
    },
    ...overrides,
  };
}

describe("buildContractTemplateInput", () => {
  describe("dispatcher", () => {
    it("devuelve kind=oferta_firme para documentKind oferta_firme", async () => {
      const result = await buildContractTemplateInput(
        {
          documentKind: "oferta_firme",
          propertyCode: "1001",
          demandId: "DEM-1",
          operationId: "OP-2026-0001",
        },
        createMockDeps(),
      );
      expect(result.input.kind).toBe("oferta_firme");
    });

    it("devuelve kind=senal_compra para documentKind senal_compra", async () => {
      const result = await buildContractTemplateInput(
        {
          documentKind: "senal_compra",
          propertyCode: "1001",
          demandId: "DEM-1",
          operationId: "OP-2026-0001",
        },
        createMockDeps(),
      );
      expect(result.input.kind).toBe("senal_compra");
    });

    it("devuelve kind=arras para documentKind arras", async () => {
      const result = await buildContractTemplateInput(
        {
          documentKind: "arras",
          propertyCode: "1001",
          demandId: "DEM-1",
          operationId: "OP-2026-0001",
        },
        createMockDeps(),
      );
      expect(result.input.kind).toBe("arras");
    });

    it("retorna error para documentKind no soportado", async () => {
      const result = await buildContractTemplateInput(
        {
          documentKind: "anexo_mobiliario",
          propertyCode: "1001",
          demandId: "DEM-1",
          operationId: "OP-2026-0001",
        },
        createMockDeps(),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues[0].message).toContain("anexo_mobiliario");
      }
    });
  });

  describe("oferta_firme extraction", () => {
    it("extrae datos del comprador desde Inmovilla", async () => {
      const result = await buildContractTemplateInput(
        {
          documentKind: "oferta_firme",
          propertyCode: "1001",
          demandId: "DEM-1",
          operationId: "OP-2026-0001",
          manualData: { offeredPrice: 250000 },
        },
        createMockDeps(),
      );
      expect(result.input.kind).toBe("oferta_firme");
      if (result.input.kind === "oferta_firme") {
        expect(result.input.payload.offerers[0].fullName).toBe("Ana Compradora Ruiz");
        expect(result.input.payload.offerers[0].nationalId).toBe("12345678A");
      }
    });

    it("extrae property data del inmueble", async () => {
      const result = await buildContractTemplateInput(
        {
          documentKind: "oferta_firme",
          propertyCode: "1001",
          demandId: "DEM-1",
          operationId: "OP-2026-0001",
        },
        createMockDeps(),
      );
      if (result.input.kind === "oferta_firme") {
        expect(result.input.payload.property.cadastralReference).toBe("1234567UH1233S0001AB");
        expect(result.input.payload.property.municipality).toBe("Cordoba");
      }
    });

    it("usa manualData para precios", async () => {
      const result = await buildContractTemplateInput(
        {
          documentKind: "oferta_firme",
          propertyCode: "1001",
          demandId: "DEM-1",
          operationId: "OP-2026-0001",
          manualData: {
            offeredPrice: 250000,
            listingPrice: 280000,
            offerDeposit: 5000,
          },
        },
        createMockDeps(),
      );
      if (result.input.kind === "oferta_firme") {
        expect(result.input.payload.offeredPrice.amount).toBe(250000);
        expect(result.input.payload.listingPrice.amount).toBe(280000);
        expect(result.input.payload.offerDeposit.amount).toBe(5000);
      }
    });
  });

  describe("senal_compra extraction", () => {
    it("extrae purchaser desde Inmovilla", async () => {
      const result = await buildContractTemplateInput(
        {
          documentKind: "senal_compra",
          propertyCode: "1001",
          demandId: "DEM-1",
          operationId: "OP-2026-0001",
          manualData: { senalAmount: 10000, offeredPrice: 250000 },
        },
        createMockDeps(),
      );
      if (result.input.kind === "senal_compra") {
        expect(result.input.payload.purchaser.fullName).toBe("Ana Compradora Ruiz");
        expect(result.input.payload.purchaser.nationalId).toBe("12345678A");
      }
    });

    it("usa manualData para importes", async () => {
      const result = await buildContractTemplateInput(
        {
          documentKind: "senal_compra",
          propertyCode: "1001",
          demandId: "DEM-1",
          operationId: "OP-2026-0001",
          manualData: { senalAmount: 10000, offeredPrice: 250000 },
        },
        createMockDeps(),
      );
      if (result.input.kind === "senal_compra") {
        expect(result.input.payload.senalAmount.amount).toBe(10000);
        expect(result.input.payload.offeredPrice.amount).toBe(250000);
      }
    });

    it("property solo tiene addressLine, municipality, cadastralReference", async () => {
      const result = await buildContractTemplateInput(
        {
          documentKind: "senal_compra",
          propertyCode: "1001",
          demandId: "DEM-1",
          operationId: "OP-2026-0001",
        },
        createMockDeps(),
      );
      if (result.input.kind === "senal_compra") {
        const prop = result.input.payload.property;
        expect(prop.addressLine).toBeTruthy();
        expect(prop.municipality).toBe("Cordoba");
        expect(prop.cadastralReference).toBeTruthy();
      }
    });
  });

  describe("error handling", () => {
    it("reporta issues cuando no se encuentra la demanda", async () => {
      const result = await buildContractTemplateInput(
        {
          documentKind: "oferta_firme",
          propertyCode: "1001",
          demandId: "DEM-INEXISTENTE",
          operationId: "OP-2026-0001",
        },
        createMockDeps({
          getDemandFromNeon: async () => null,
        }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.some((i) => i.fieldPath.includes("demand"))).toBe(true);
      }
    });

    it("reporta issues cuando no se encuentra la propiedad en Inmovilla", async () => {
      const result = await buildContractTemplateInput(
        {
          documentKind: "senal_compra",
          propertyCode: "INEXISTENTE",
          demandId: "DEM-1",
          operationId: "OP-2026-0001",
        },
        createMockDeps({
          getInmovillaProperty: async () => null,
          getPropertyFromNeon: async () => null,
        }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.some((i) => i.fieldPath.includes("property"))).toBe(true);
      }
    });

    it("construye validationSignal con documentKind correcto", async () => {
      const result = await buildContractTemplateInput(
        {
          documentKind: "senal_compra",
          propertyCode: "1001",
          demandId: "DEM-1",
          operationId: "OP-2026-0001",
        },
        createMockDeps({ getDemandFromNeon: async () => null }),
      );
      if (!result.ok) {
        expect(result.validationSignal.event.documentKind).toBe("senal_compra");
        expect(result.validationSignal.commercialTask.operationId).toBe("OP-2026-0001");
      }
    });
  });

  describe("sources tracking", () => {
    it("reporta sources correctamente cuando todo se encuentra", async () => {
      const result = await buildContractTemplateInput(
        {
          documentKind: "oferta_firme",
          propertyCode: "1001",
          demandId: "DEM-1",
          operationId: "OP-2026-0001",
        },
        createMockDeps(),
      );
      expect(result.sources.demandFoundInNeon).toBe(true);
      expect(result.sources.propertyFoundInNeon).toBe(true);
      expect(result.sources.propertyFoundInInmovilla).toBe(true);
      expect(result.sources.buyerClientFoundInInmovilla).toBe(true);
    });

    it("reporta sources.sellerClientFoundInInmovilla=false para oferta_firme (no usa vendedor)", async () => {
      const result = await buildContractTemplateInput(
        {
          documentKind: "oferta_firme",
          propertyCode: "1001",
          demandId: "DEM-1",
          operationId: "OP-2026-0001",
        },
        createMockDeps(),
      );
      expect(result.sources.sellerClientFoundInInmovilla).toBe(false);
    });
  });
});
