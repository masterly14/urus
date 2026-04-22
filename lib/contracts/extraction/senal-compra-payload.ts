import type { ContractFieldIssue, ContractTemplateInput, SenalCompraContractPayload } from "@/types/contracts";
import { validateContractTemplateInput } from "../docx/validators";
import {
  type ExtractionDeps,
  type ExtractionSources,
  type ContractIncompleteValidationSignal,
  type UnknownRecord,
  asRecord,
  cleanString,
  toMoney,
  mapClientToPerson,
  resolvePropertyData,
  pickClientCode,
  appendIssue,
  buildIncompleteValidationSignal,
  BUYER_CLIENT_ID_KEYS,
} from "./shared";

type SenalCompraInput = Extract<ContractTemplateInput, { kind: "senal_compra" }>;

export interface BuildSenalCompraParams {
  demandId: string;
  propertyCode: string;
  operationId: string;
  assignedCommercialId?: string;
  manualData?: UnknownRecord;
  templateVersion?: string;
}

export type BuildSenalCompraResult =
  | { ok: true; input: SenalCompraInput; sources: ExtractionSources }
  | {
      ok: false;
      input: SenalCompraInput;
      issues: ContractFieldIssue[];
      validationSignal: ContractIncompleteValidationSignal;
      sources: ExtractionSources;
    };

export async function buildSenalCompraFromNeonAndInmovilla(
  params: BuildSenalCompraParams,
  deps: ExtractionDeps,
): Promise<BuildSenalCompraResult> {
  const manual = params.manualData ?? {};
  const extractionIssues: ContractFieldIssue[] = [];

  const [neonDemand, neonProperty, inmovillaProperty] = await Promise.all([
    deps.getDemandFromNeon(params.demandId),
    deps.getPropertyFromNeon(params.propertyCode),
    deps.getInmovillaProperty(params.propertyCode),
  ]);

  if (!neonDemand) {
    appendIssue(extractionIssues, "senal_compra", "sources.neon.demand",
      `No se encontraron datos de demanda en Neon para demandId=${params.demandId}.`);
  }
  if (!neonProperty) {
    appendIssue(extractionIssues, "senal_compra", "sources.neon.property",
      `No se encontraron datos de inmueble en Neon para propertyCode=${params.propertyCode}.`);
  }
  if (!inmovillaProperty) {
    appendIssue(extractionIssues, "senal_compra", "sources.inmovilla.property",
      `No se encontraron datos de inmueble en Inmovilla para propertyCode=${params.propertyCode}.`);
  }

  const demandRaw = asRecord(neonDemand?.raw);
  const buyerClientCode = pickClientCode(demandRaw, BUYER_CLIENT_ID_KEYS);

  if (!buyerClientCode) {
    appendIssue(extractionIssues, "senal_compra", "sources.inmovilla.buyerClientCode",
      "No se pudo resolver el cod_cli del comprador desde la demanda en Neon.");
  }

  const buyerClient = buyerClientCode ? await deps.getInmovillaClient(buyerClientCode) : null;
  if (buyerClientCode && !buyerClient) {
    appendIssue(extractionIssues, "senal_compra", "sources.inmovilla.buyerClient",
      `No se encontró el cliente comprador en Inmovilla (cod_cli=${buyerClientCode}).`);
  }

  const documentDateIso = cleanString(manual.documentDateIso) || new Date().toISOString().slice(0, 10);
  const city = cleanString(neonProperty?.ciudad);

  const purchaser = mapClientToPerson(buyerClient, cleanString(neonDemand?.nombre), city);
  const fullProperty = resolvePropertyData(inmovillaProperty, neonProperty);

  const senalAmountValue = Number(manual.senalAmount) || 0;
  const offeredPriceValue = Number(manual.offeredPrice) || 0;

  const agencyRaw = asRecord(manual.agency);
  const feesRaw = asRecord(manual.fees);

  const payload: SenalCompraContractPayload = {
    documentDateIso,
    signPlace: cleanString(manual.signPlace) || city,
    agency: {
      representative: {
        fullName: cleanString(agencyRaw.representativeFullName),
        nationalId: cleanString(agencyRaw.representativeNationalId),
        fiscalAddress: {
          streetLine: cleanString(agencyRaw.representativeStreet),
          municipality: cleanString(agencyRaw.representativeMunicipality) || city,
        },
      },
      companyLegalName: cleanString(agencyRaw.companyLegalName),
      companyTaxId: cleanString(agencyRaw.companyTaxId),
      companyMunicipality: cleanString(agencyRaw.companyMunicipality) || city,
      depositBankAccount: {
        iban: cleanString(agencyRaw.depositIban),
        bankName: cleanString(agencyRaw.depositBankName),
        holdersLine: cleanString(agencyRaw.depositHoldersLine),
      },
    },
    purchaser,
    property: {
      addressLine: fullProperty.addressLine,
      municipality: fullProperty.municipality,
      cadastralReference: fullProperty.cadastralReference,
    },
    senalAmount: toMoney(senalAmountValue, cleanString(manual.senalAmountLiteralEs)),
    offeredPrice: toMoney(offeredPriceValue, cleanString(manual.offeredPriceLiteralEs)),
    timelines: {
      businessDaysToArrasContract: Number(manual.businessDaysToArrasContract) || 10,
      maxNaturalDaysToEscrituraFromSenalSignature: Number(manual.maxNaturalDaysToEscrituraFromSenalSignature) || 90,
      convocatoriaNotaryMinNaturalDays: Number(manual.convocatoriaNotaryMinNaturalDays) || 7,
    },
    fees: feesRaw.model === "percent_of_final_price"
      ? {
          model: "percent_of_final_price",
          percentOfFinalPrice: Number(feesRaw.percentOfFinalPrice) || 0,
          vatRatePercent: Number(feesRaw.vatRatePercent) || 21,
          devengo: "firma_arras",
        }
      : {
          model: "fixed_net",
          netAmount: toMoney(Number(feesRaw.netAmount) || 0),
          vatRatePercent: Number(feesRaw.vatRatePercent) || 21,
          devengo: "firma_arras",
        },
    jurisdiction: {
      courtsMunicipality: cleanString(manual.jurisdictionCourtsMunicipality) || city,
    },
    flags: {
      includeFinancingFallbackClause: manual.includeFinancingFallbackClause === true,
      keysHandover: (cleanString(manual.keysHandover) || "same_day_as_deed") as "same_day_as_deed",
    },
  };

  const input: SenalCompraInput = {
    kind: "senal_compra",
    templateVersion: params.templateVersion,
    payload,
  };

  const validationIssues = validateContractTemplateInput(input);
  const issues = [...extractionIssues, ...validationIssues];

  const sources: ExtractionSources = {
    demandFoundInNeon: Boolean(neonDemand),
    propertyFoundInNeon: Boolean(neonProperty),
    propertyFoundInInmovilla: Boolean(inmovillaProperty),
    buyerClientFoundInInmovilla: Boolean(buyerClient),
    sellerClientFoundInInmovilla: false,
  };

  if (issues.length > 0) {
    return {
      ok: false,
      input,
      issues,
      validationSignal: buildIncompleteValidationSignal(
        "senal_compra", params.demandId, params.propertyCode,
        params.operationId, params.assignedCommercialId ?? "system", issues,
      ),
      sources,
    };
  }

  return { ok: true, input, sources };
}
