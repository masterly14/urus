import type { ContractFieldIssue, ContractTemplateInput, OfertaFirmeContractPayload } from "@/types/contracts";
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

type OfertaFirmeInput = Extract<ContractTemplateInput, { kind: "oferta_firme" }>;

export interface BuildOfertaFirmeParams {
  demandId: string;
  propertyCode: string;
  operationId: string;
  assignedCommercialId?: string;
  manualData?: UnknownRecord;
  templateVersion?: string;
}

export type BuildOfertaFirmeResult =
  | { ok: true; input: OfertaFirmeInput; sources: ExtractionSources }
  | {
      ok: false;
      input: OfertaFirmeInput;
      issues: ContractFieldIssue[];
      validationSignal: ContractIncompleteValidationSignal;
      sources: ExtractionSources;
    };

export async function buildOfertaFirmeFromNeonAndInmovilla(
  params: BuildOfertaFirmeParams,
  deps: ExtractionDeps,
): Promise<BuildOfertaFirmeResult> {
  const manual = params.manualData ?? {};
  const extractionIssues: ContractFieldIssue[] = [];

  const [neonDemand, neonProperty, inmovillaProperty] = await Promise.all([
    deps.getDemandFromNeon(params.demandId),
    deps.getPropertyFromNeon(params.propertyCode),
    deps.getInmovillaProperty(params.propertyCode),
  ]);

  if (!neonDemand) {
    appendIssue(extractionIssues, "oferta_firme", "sources.neon.demand",
      `No se encontraron datos de demanda en Neon para demandId=${params.demandId}.`);
  }
  if (!neonProperty) {
    appendIssue(extractionIssues, "oferta_firme", "sources.neon.property",
      `No se encontraron datos de inmueble en Neon para propertyCode=${params.propertyCode}.`);
  }
  if (!inmovillaProperty) {
    appendIssue(extractionIssues, "oferta_firme", "sources.inmovilla.property",
      `No se encontraron datos de inmueble en Inmovilla para propertyCode=${params.propertyCode}.`);
  }

  const demandRaw = asRecord(neonDemand?.raw);
  const buyerClientCode = pickClientCode(demandRaw, BUYER_CLIENT_ID_KEYS);

  if (!buyerClientCode) {
    appendIssue(extractionIssues, "oferta_firme", "sources.inmovilla.buyerClientCode",
      "No se pudo resolver el cod_cli del comprador desde la demanda en Neon.");
  }

  const buyerClient = buyerClientCode ? await deps.getInmovillaClient(buyerClientCode) : null;
  if (buyerClientCode && !buyerClient) {
    appendIssue(extractionIssues, "oferta_firme", "sources.inmovilla.buyerClient",
      `No se encontró el cliente comprador en Inmovilla (cod_cli=${buyerClientCode}).`);
  }

  const documentDateIso = cleanString(manual.documentDateIso) || new Date().toISOString().slice(0, 10);
  const city = cleanString(neonProperty?.ciudad);

  const offerer = mapClientToPerson(buyerClient, cleanString(neonDemand?.nombre), city);
  const property = resolvePropertyData(inmovillaProperty, neonProperty);

  const offeredPriceAmount = Number(manual.offeredPrice) || 0;
  const listingPriceAmount = Number(manual.listingPrice) || 0;
  const offerDepositAmount = Number(manual.offerDeposit) || 0;
  const arrasAfterAcceptanceAmount = Number(manual.arrasAmountAfterAcceptance) || 0;

  const agencyRaw = asRecord(manual.agency);
  const feesRaw = asRecord(manual.fees);

  const payload: OfertaFirmeContractPayload = {
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
    offerers: [offerer],
    property,
    listingPrice: toMoney(listingPriceAmount, cleanString(manual.listingPriceLiteralEs)),
    offeredPrice: toMoney(offeredPriceAmount, cleanString(manual.offeredPriceLiteralEs)),
    offerDeposit: toMoney(offerDepositAmount, cleanString(manual.offerDepositLiteralEs)),
    arrasAmountAfterAcceptance: toMoney(arrasAfterAcceptanceAmount, cleanString(manual.arrasAmountAfterAcceptanceLiteralEs)),
    timelines: {
      offerValidityNaturalDays: Number(manual.offerValidityNaturalDays) || 3,
      arrasSigningMaxNaturalDaysFromAcceptance: Number(manual.arrasSigningMaxNaturalDaysFromAcceptance) || 15,
      escrituraMaxNaturalDaysFromArrasSignature: Number(manual.escrituraMaxNaturalDaysFromArrasSignature) || 90,
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
      includePropertyAcceptanceSection: manual.includePropertyAcceptanceSection !== false,
    },
  };

  const input: OfertaFirmeInput = {
    kind: "oferta_firme",
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
        "oferta_firme", params.demandId, params.propertyCode,
        params.operationId, params.assignedCommercialId ?? "system", issues,
      ),
      sources,
    };
  }

  return { ok: true, input, sources };
}
