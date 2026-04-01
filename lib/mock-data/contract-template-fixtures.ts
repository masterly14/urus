/**
 * Fixtures `ContractTemplateInput` válidos para Smart Closing (dev/demo).
 * Alineados con los tests del motor DOCX; ids coinciden con `lib/mock-data/contratos`.
 */

import type { Contrato } from "@/lib/mock-data/types";
import type {
  ArrasContractPayload,
  ContractTemplateInput,
  OfertaFirmeContractPayload,
  SenalCompraContractPayload,
} from "@/types/contracts";

function arrasPayload(overrides?: Partial<ArrasContractPayload>): ArrasContractPayload {
  const base: ArrasContractPayload = {
    documentDateIso: "2026-05-21",
    signPlace: "Córdoba",
    buyers: [
      {
        fullName: "Ana López",
        nationalId: "12345678A",
        fiscalAddress: {
          streetLine: "Calle Sol 1",
          municipality: "Córdoba",
        },
      },
    ],
    sellers: [
      {
        fullName: "José Pérez",
        nationalId: "98765432B",
        fiscalAddress: {
          streetLine: "Avenida Luna 2",
          municipality: "Córdoba",
        },
      },
    ],
    property: {
      addressLine: "Calle Test 33",
      municipality: "Córdoba",
      cadastralReference: "1234567UH1233S0001AB",
      urbanDescriptionLine: "URBANA: vivienda",
      registryOfficeName: "Registro de Córdoba",
      registryOfficeNumber: "2",
      fincaNumber: "987",
      cru: "CRU12345",
    },
    totalPurchasePrice: { amount: 280_000, literalEs: "doscientos ochenta mil euros" },
    arrasAmount: { amount: 28_000, literalEs: "veintiocho mil euros" },
    remainderAtPublicDeed: { amount: 252_000, literalEs: "doscientos cincuenta y dos mil euros" },
    arrasPaymentAccount: {
      iban: "ES1121000418450200051332",
      bankName: "CaixaBank",
      holdersLine: "José Pérez",
    },
    timelines: {
      maxDeedDateIso: "2026-08-21",
      maxKeysHandoverDateIso: "2026-08-21",
      convocatoriaNotaryMinNaturalDays: 7,
    },
    jurisdiction: {
      courtsMunicipality: "Córdoba",
    },
    flags: {
      arrasRegime: "penitencial",
      keysHandover: "same_day_as_deed",
      validitySubjectToSellerReceipt: true,
    },
  };
  return {
    ...base,
    ...overrides,
    flags: {
      ...base.flags,
      ...(overrides?.flags ?? {}),
    },
  };
}

function senalPayload(): SenalCompraContractPayload {
  return {
    documentDateIso: "2026-03-24",
    signPlace: "Córdoba",
    agency: {
      representative: {
        fullName: "Miguel Ángel Carrillo Ramos",
        nationalId: "46266189-X",
        fiscalAddress: { streetLine: "Calle Test 1", municipality: "Córdoba" },
      },
      companyLegalName: "URUS CAPITAL GROUP S.L.",
      companyTaxId: "B55460976",
      companyMunicipality: "Córdoba",
      depositBankAccount: {
        iban: "ES85 0182 2104 4002 0170 4067",
        bankName: "BBVA",
        holdersLine: "URUS CAPITAL GROUP S.L.",
      },
    },
    purchaser: {
      fullName: "Juan Pérez López",
      nationalId: "12345678A",
      fiscalAddress: { streetLine: "Calle Mayor 10", municipality: "Córdoba" },
    },
    property: {
      addressLine: "Calle Ejemplo 5",
      municipality: "Córdoba",
      cadastralReference: "1234567890ABCDEF",
    },
    senalAmount: { amount: 3000, literalEs: "tres mil euros" },
    offeredPrice: { amount: 180_000, literalEs: "ciento ochenta mil euros" },
    timelines: {
      businessDaysToArrasContract: 15,
      maxNaturalDaysToEscrituraFromSenalSignature: 90,
      convocatoriaNotaryMinNaturalDays: 7,
    },
    fees: {
      model: "fixed_net",
      netAmount: { amount: 3500, literalEs: "tres mil quinientos euros" },
      vatRatePercent: 21,
      devengo: "firma_arras",
    },
    jurisdiction: { courtsMunicipality: "Córdoba" },
    flags: {
      includeFinancingFallbackClause: true,
      keysHandover: "same_day_as_deed",
    },
  };
}

function ofertaPayload(): OfertaFirmeContractPayload {
  return {
    documentDateIso: "2026-03-24",
    signPlace: "Córdoba",
    agency: {
      representative: {
        fullName: "Miguel Ángel Carrillo Ramos",
        nationalId: "46266189-X",
        fiscalAddress: { streetLine: "Calle Test 1", municipality: "Córdoba" },
      },
      companyLegalName: "URUS CAPITAL GROUP S.L.",
      companyTaxId: "B55460976",
      companyMunicipality: "Córdoba",
      depositBankAccount: {
        iban: "ES85 0182 2104 4002 0170 4067",
        bankName: "BBVA",
        holdersLine: "URUS CAPITAL GROUP S.L.",
      },
    },
    offerers: [
      {
        fullName: "Ana García Ruiz",
        nationalId: "87654321B",
        fiscalAddress: { streetLine: "Calle Góngora 3", municipality: "Córdoba" },
      },
    ],
    property: {
      addressLine: "Calle del Olivo 12",
      municipality: "Córdoba",
      cadastralReference: "ABCDEF1234567890",
      fincaNumber: "1234",
      cru: "14900000012345",
      tomo: "1000",
      libro: "500",
      folio: "123",
      inscripcion: "1",
      registryOfficeName: "Registro de la Propiedad",
      registryOfficeNumber: "3",
    },
    listingPrice: { amount: 250_000, literalEs: "doscientos cincuenta mil euros" },
    offeredPrice: { amount: 230_000, literalEs: "doscientos treinta mil euros" },
    offerDeposit: { amount: 5000, literalEs: "cinco mil euros" },
    arrasAmountAfterAcceptance: { amount: 23_000, literalEs: "veintitrés mil euros" },
    timelines: {
      offerValidityNaturalDays: 3,
      arrasSigningMaxNaturalDaysFromAcceptance: 10,
      escrituraMaxNaturalDaysFromArrasSignature: 90,
    },
    fees: {
      model: "percent_of_final_price",
      percentOfFinalPrice: 2,
      vatRatePercent: 21,
      devengo: "firma_arras",
    },
    jurisdiction: { courtsMunicipality: "Córdoba" },
    flags: {
      includePropertyAcceptanceSection: true,
    },
  };
}

const FIXTURES: Record<string, ContractTemplateInput> = {
  "ctr-1": {
    kind: "arras",
    templateVersion: "2025.03.m8-v1",
    payload: arrasPayload(),
  },
  "ctr-2": {
    kind: "senal_compra",
    templateVersion: "2025.03.m8-v1",
    payload: senalPayload(),
  },
  "ctr-3": {
    kind: "arras",
    templateVersion: "2025.03.m8-v1",
    payload: arrasPayload({
      flags: {
        arrasRegime: "confirmatoria",
        keysHandover: "same_day_as_deed",
        validitySubjectToSellerReceipt: true,
      },
    }),
  },
  "ctr-4": {
    kind: "oferta_firme",
    templateVersion: "2025.03.m8-v1",
    payload: ofertaPayload(),
  },
  "ctr-5": {
    kind: "senal_compra",
    templateVersion: "2025.03.m8-v1",
    payload: {
      ...senalPayload(),
      purchaser: {
        fullName: "David Torres",
        nationalId: "11111111H",
        fiscalAddress: { streetLine: "Plaza Mayor 2", municipality: "Córdoba" },
      },
    },
  },
};

/** Id de fila en `lib/mock-data/contratos` → plantilla inicial Smart Closing. */
export function getContractTemplateFixtureByListId(id: string): ContractTemplateInput | null {
  return FIXTURES[id] ?? null;
}

export function listSmartClosingFixtureIds(): string[] {
  return Object.keys(FIXTURES);
}

/** Contexto de versionado mock: `propertyCode` = código operación lista; `operationId` estilo plan. */
export function smartClosingVersioningFromContrato(
  row: Contrato,
): {
  propertyCode: string;
  operationId: string;
  recordVersionEvent: true;
} {
  const num = /^op-(\d+)$/i.exec(row.operacion.trim())?.[1];
  const operationId = num
    ? `OP-2026-${num.padStart(4, "0")}`
    : `OP-2026-${row.operacion.replace(/\s+/g, "")}`;
  return {
    propertyCode: row.operacion,
    operationId,
    recordVersionEvent: true,
  };
}
