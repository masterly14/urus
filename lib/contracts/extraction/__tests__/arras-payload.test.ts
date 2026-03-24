import { describe, expect, it } from "vitest";
import {
  type ArrasExtractionDeps,
  buildArrasContractTemplateInputFromNeonAndInmovilla,
} from "../arras-payload";

function createDeps(overrides?: Partial<ArrasExtractionDeps>): ArrasExtractionDeps {
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

describe("buildArrasContractTemplateInputFromNeonAndInmovilla", () => {
  it("construye payload completo con datos de Neon + Inmovilla", async () => {
    const deps = createDeps();
    const result = await buildArrasContractTemplateInputFromNeonAndInmovilla(
      {
        demandId: "DEM-1",
        propertyCode: "1001",
        operation: {
          operationId: "OP-2026-0001",
          totalPurchasePriceAmount: 280000,
          arrasAmountAmount: 28000,
          signPlace: "Cordoba",
          arrasPaymentAccount: {
            iban: "ES1121000418450200051332",
            bankName: "CaixaBank",
            holdersLine: "Jose Vendedor Lopez",
          },
          timelines: {
            maxDeedDateIso: "2026-08-21",
            maxKeysHandoverDateIso: "2026-08-21",
            convocatoriaNotaryMinNaturalDays: 7,
          },
          flags: {
            arrasRegime: "penitencial",
            keysHandover: "same_day_as_deed",
            validitySubjectToSellerReceipt: true,
          },
          jurisdictionCourtsMunicipality: "Cordoba",
        },
      },
      deps,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Se esperaba extracción correcta");
    }

    expect(result.input.kind).toBe("arras");
    expect(result.input.payload.buyers[0].fullName).toContain("Ana Compradora");
    expect(result.input.payload.sellers[0].fullName).toContain("Jose Vendedor");
    expect(result.input.payload.property.cadastralReference).toBe("1234567UH1233S0001AB");
    expect(result.input.payload.totalPurchasePrice.amount).toBe(280000);
    expect(result.input.payload.arrasAmount.amount).toBe(28000);
    expect(result.input.payload.remainderAtPublicDeed.amount).toBe(252000);
    expect(result.sources.propertyFoundInInmovilla).toBe(true);
  });

  it("devuelve issues cuando faltan datos obligatorios de extracción", async () => {
    const deps = createDeps({
      getDemandFromNeon: async () => null,
      getPropertyFromNeon: async () => null,
      getInmovillaProperty: async () => null,
      getInmovillaClient: async () => null,
    });

    const result = await buildArrasContractTemplateInputFromNeonAndInmovilla(
      {
        demandId: "DEM-404",
        propertyCode: "9999",
        operation: {
          operationId: "OP-404",
          totalPurchasePriceAmount: 100000,
          arrasAmountAmount: 10000,
        },
      },
      deps,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Se esperaban issues por datos incompletos");
    }

    expect(result.issues.some((issue) => issue.fieldPath === "sources.neon.demand")).toBe(true);
    expect(result.issues.some((issue) => issue.fieldPath === "buyers.0.fullName")).toBe(true);
    expect(result.issues.some((issue) => issue.fieldPath === "sellers.0.nationalId")).toBe(true);
    expect(result.issues.some((issue) => issue.fieldPath === "property.cadastralReference")).toBe(
      true,
    );
    expect(result.validationSignal.event.event).toBe("DATOS_INCOMPLETOS");
    expect(result.validationSignal.commercialTask.type).toBe("CONTRACT_DATA_COMPLETION");
  });

  it("usa fallback de vendedor desde propertySnapshot cuando Inmovilla no devuelve propiedad", async () => {
    const deps = createDeps({
      getInmovillaProperty: async () => null,
      getPropertyFromNeon: async () => ({
        codigo: "1001",
        ciudad: "Malaga",
        titulo: "Piso test",
        raw: { keycli: "303", propietario: "Lucia Vendedora" },
      }),
      getInmovillaClient: async (clientCode: number) => {
        if (clientCode === 101) {
          return {
            cod_cli: 101,
            nombre: "Mario",
            apellidos: "Comprador",
            nif: "11223344C",
            calle: "Calle A",
            localidad: "Malaga",
          };
        }
        if (clientCode === 303) {
          return {
            cod_cli: 303,
            nombre: "Lucia",
            apellidos: "Vendedora",
            nif: "99887766D",
            calle: "Calle B",
            localidad: "Malaga",
          };
        }
        return null;
      },
    });

    const result = await buildArrasContractTemplateInputFromNeonAndInmovilla(
      {
        demandId: "DEM-1",
        propertyCode: "1001",
        operation: {
          operationId: "OP-2",
          totalPurchasePriceAmount: 250000,
          arrasAmountAmount: 25000,
          arrasPaymentAccount: {
            iban: "ES7620770024003102575766",
            bankName: "BBVA",
            holdersLine: "Lucia Vendedora",
          },
        },
      },
      deps,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Se esperan issues por faltar datos de propiedad en Inmovilla");
    }

    expect(result.input.payload.sellers[0].fullName).toContain("Lucia Vendedora");
    expect(result.issues.some((issue) => issue.fieldPath === "sources.inmovilla.property")).toBe(
      true,
    );
  });

  it("clasifica categorias obligatorias y crea tarea de comercial con prioridad alta", async () => {
    const deps = createDeps({
      getInmovillaClient: async (clientCode: number) => {
        if (clientCode === 101) {
          return {
            cod_cli: 101,
            nombre: "Ana",
            apellidos: "Compradora",
            nif: "",
            calle: "",
            localidad: "",
          };
        }
        if (clientCode === 202) {
          return {
            cod_cli: 202,
            nombre: "Jose",
            apellidos: "Vendedor",
            nif: "",
            calle: "",
            localidad: "",
          };
        }
        return null;
      },
    });

    const result = await buildArrasContractTemplateInputFromNeonAndInmovilla(
      {
        demandId: "DEM-1",
        propertyCode: "1001",
        operation: {
          operationId: "OP-VALID-001",
          assignedCommercialId: "com-123",
          totalPurchasePriceAmount: 0,
          arrasAmountAmount: 0,
          timelines: {
            maxDeedDateIso: "",
            maxKeysHandoverDateIso: "",
            convocatoriaNotaryMinNaturalDays: 0,
          },
          arrasPaymentAccount: {
            iban: "",
            bankName: "",
            holdersLine: "",
          },
        },
      },
      deps,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Se esperaban issues de validación obligatoria");
    }

    expect(result.validationSignal.event.missingRequiredCategories).toEqual(
      expect.arrayContaining(["dni", "domicilio", "precio", "plazos"]),
    );
    expect(result.validationSignal.commercialTask.assignedCommercialId).toBe("com-123");
    expect(result.validationSignal.commercialTask.priority).toBe("HIGH");
    expect(result.validationSignal.commercialTask.status).toBe("PENDING");
  });
});
