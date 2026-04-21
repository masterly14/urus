import type {
  ArrasContractPayload,
  ContractDocumentKind,
  ContractTemplateInput,
  NaturalPerson,
  OfertaFirmeContractPayload,
  SenalCompraContractPayload,
  AgencyParty,
  MoneyEUR,
  BankAccount,
} from "@/types/contracts";

const MOCK_BUYER: NaturalPerson = {
  fullName: "Maria Lopez Garcia",
  nationalId: "12345678A",
  fiscalAddress: {
    streetLine: "C/ Gran Via 10, 3o B",
    postalCode: "28013",
    municipality: "Madrid",
    province: "Madrid",
  },
};

const MOCK_SELLER: NaturalPerson = {
  fullName: "Pedro Martinez Ruiz",
  nationalId: "87654321B",
  fiscalAddress: {
    streetLine: "Av. Diagonal 450, 2o A",
    postalCode: "08006",
    municipality: "Barcelona",
    province: "Barcelona",
  },
};

const MOCK_AGENCY: AgencyParty = {
  representative: {
    fullName: "Juan Perez Gomez",
    nationalId: "11111111H",
    fiscalAddress: {
      streetLine: "C/ Alcala 100",
      postalCode: "28009",
      municipality: "Madrid",
      province: "Madrid",
    },
  },
  companyLegalName: "URUS CAPITAL GROUP S.L.",
  companyTaxId: "B12345678",
  companyMunicipality: "Madrid",
  depositBankAccount: {
    iban: "ES12 0000 0000 0000 0000 0000",
    bankName: "Banco Ejemplo",
    holdersLine: "URUS CAPITAL GROUP S.L.",
  },
};

const MOCK_BANK_ACCOUNT: BankAccount = {
  iban: "ES91 2100 0418 4502 0005 1332",
  bankName: "CaixaBank",
  holdersLine: "Pedro Martinez Ruiz",
};

function money(amount: number, literal: string): MoneyEUR {
  return { amount, literalEs: literal };
}

function buildArrasMock(): ArrasContractPayload {
  return {
    documentDateIso: "2026-04-20",
    signPlace: "Madrid",
    buyers: [MOCK_BUYER],
    sellers: [MOCK_SELLER],
    property: {
      addressLine: "C/ Serrano 25, 3o B",
      municipality: "Madrid",
      cadastralReference: "1234567AB1234N0001XX",
      urbanDescriptionLine: "URBANA: Piso vivienda en planta tercera",
      registryOfficeName: "Registro de la Propiedad n. 5 de Madrid",
      registryOfficeNumber: "5",
      fincaNumber: "12345",
      cru: "28000000012345",
    },
    totalPurchasePrice: money(250000, "doscientos cincuenta mil euros"),
    arrasAmount: money(25000, "veinticinco mil euros"),
    remainderAtPublicDeed: money(225000, "doscientos veinticinco mil euros"),
    arrasPaymentAccount: MOCK_BANK_ACCOUNT,
    timelines: {
      maxDeedDateIso: "2026-07-15",
      maxKeysHandoverDateIso: "2026-07-15",
      convocatoriaNotaryMinNaturalDays: 7,
    },
    jurisdiction: { courtsMunicipality: "Madrid" },
    flags: {
      arrasRegime: "penitencial",
      keysHandover: "same_day_as_deed",
      validitySubjectToSellerReceipt: false,
    },
  };
}

function buildSenalCompraMock(): SenalCompraContractPayload {
  return {
    documentDateIso: "2026-04-20",
    signPlace: "Madrid",
    agency: MOCK_AGENCY,
    purchaser: MOCK_BUYER,
    property: {
      addressLine: "C/ Serrano 25, 3o B",
      municipality: "Madrid",
      cadastralReference: "1234567AB1234N0001XX",
    },
    senalAmount: money(10000, "diez mil euros"),
    offeredPrice: money(240000, "doscientos cuarenta mil euros"),
    timelines: {
      businessDaysToArrasContract: 10,
      maxNaturalDaysToEscrituraFromSenalSignature: 90,
      convocatoriaNotaryMinNaturalDays: 7,
    },
    fees: {
      model: "fixed_net",
      netAmount: money(5000, "cinco mil euros"),
      vatRatePercent: 21,
      devengo: "firma_arras",
    },
    jurisdiction: { courtsMunicipality: "Madrid" },
    flags: {
      includeFinancingFallbackClause: false,
      keysHandover: "same_day_as_deed",
    },
  };
}

function buildOfertaFirmeMock(): OfertaFirmeContractPayload {
  return {
    documentDateIso: "2026-04-20",
    signPlace: "Madrid",
    agency: MOCK_AGENCY,
    offerers: [MOCK_BUYER],
    property: {
      addressLine: "C/ Serrano 25, 3o B",
      municipality: "Madrid",
      cadastralReference: "1234567AB1234N0001XX",
    },
    listingPrice: money(260000, "doscientos sesenta mil euros"),
    offeredPrice: money(240000, "doscientos cuarenta mil euros"),
    offerDeposit: money(3000, "tres mil euros"),
    arrasAmountAfterAcceptance: money(25000, "veinticinco mil euros"),
    timelines: {
      offerValidityNaturalDays: 3,
      arrasSigningMaxNaturalDaysFromAcceptance: 15,
      escrituraMaxNaturalDaysFromArrasSignature: 90,
    },
    fees: {
      model: "percent_of_final_price",
      percentOfFinalPrice: 3,
      vatRatePercent: 21,
      devengo: "firma_arras",
    },
    jurisdiction: { courtsMunicipality: "Madrid" },
    flags: {
      includePropertyAcceptanceSection: true,
    },
  };
}

export function buildMockPayload(kind: ContractDocumentKind): ContractTemplateInput {
  switch (kind) {
    case "arras":
      return { kind: "arras", payload: buildArrasMock() };
    case "senal_compra":
      return { kind: "senal_compra", payload: buildSenalCompraMock() };
    case "oferta_firme":
      return { kind: "oferta_firme", payload: buildOfertaFirmeMock() };
    default:
      return { kind: "arras", payload: buildArrasMock() };
  }
}
