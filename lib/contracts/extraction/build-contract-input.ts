import type { ContractDocumentKind, ContractFieldIssue, ContractTemplateInput } from "@/types/contracts";
import {
  type ExtractionDeps,
  type ExtractionSources,
  type ContractIncompleteValidationSignal,
  type UnknownRecord,
  createDefaultExtractionDeps,
} from "./shared";
import {
  buildArrasContractTemplateInputFromNeonAndInmovilla,
  createDefaultArrasExtractionDeps,
  type BuildArrasPayloadParams,
} from "./arras-payload";
import { buildOfertaFirmeFromNeonAndInmovilla } from "./oferta-firme-payload";
import { buildSenalCompraFromNeonAndInmovilla } from "./senal-compra-payload";

export interface BuildContractInputParams {
  documentKind: ContractDocumentKind;
  propertyCode: string;
  demandId: string;
  operationId: string;
  assignedCommercialId?: string;
  manualData?: UnknownRecord;
  templateVersion?: string;
}

export type BuildContractInputResult =
  | {
      ok: true;
      input: ContractTemplateInput;
      sources: ExtractionSources;
    }
  | {
      ok: false;
      input: ContractTemplateInput;
      issues: ContractFieldIssue[];
      validationSignal: ContractIncompleteValidationSignal;
      sources: ExtractionSources;
    };

/**
 * Dispatcher: delega la extracción al extractor correspondiente
 * según `documentKind`.
 *
 * Para arras, reutiliza el extractor legacy (`arras-payload.ts`) adaptando
 * los datos manuales al formato de `ArrasOperationData`.
 */
export async function buildContractTemplateInput(
  params: BuildContractInputParams,
  deps?: ExtractionDeps,
): Promise<BuildContractInputResult> {
  const { documentKind, propertyCode, demandId, operationId, assignedCommercialId, manualData, templateVersion } = params;

  switch (documentKind) {
    case "oferta_firme": {
      const d = deps ?? createDefaultExtractionDeps();
      return buildOfertaFirmeFromNeonAndInmovilla(
        { demandId, propertyCode, operationId, assignedCommercialId, manualData, templateVersion },
        d,
      );
    }

    case "senal_compra": {
      const d = deps ?? createDefaultExtractionDeps();
      return buildSenalCompraFromNeonAndInmovilla(
        { demandId, propertyCode, operationId, assignedCommercialId, manualData, templateVersion },
        d,
      );
    }

    case "arras": {
      const d = deps
        ? {
            getDemandFromNeon: deps.getDemandFromNeon,
            getPropertyFromNeon: deps.getPropertyFromNeon,
            getInmovillaProperty: deps.getInmovillaProperty,
            getInmovillaClient: deps.getInmovillaClient,
          }
        : createDefaultArrasExtractionDeps();

      const manual = manualData ?? {};

      const arrasParams: BuildArrasPayloadParams = {
        demandId,
        propertyCode,
        templateVersion,
        operation: {
          operationId,
          assignedCommercialId,
          totalPurchasePriceAmount: Number(manual.totalPurchasePrice) || 0,
          arrasAmountAmount: Number(manual.arrasAmount) || 0,
          totalPurchasePriceLiteralEs:
            typeof manual.totalPurchasePriceLiteralEs === "string"
              ? manual.totalPurchasePriceLiteralEs : undefined,
          arrasAmountLiteralEs:
            typeof manual.arrasAmountLiteralEs === "string"
              ? manual.arrasAmountLiteralEs : undefined,
          remainderAtPublicDeedAmount:
            typeof manual.remainderAtPublicDeed === "number"
              ? manual.remainderAtPublicDeed : undefined,
          documentDateIso:
            typeof manual.documentDateIso === "string"
              ? manual.documentDateIso : undefined,
          signPlace:
            typeof manual.signPlace === "string"
              ? manual.signPlace : undefined,
          jurisdictionCourtsMunicipality:
            typeof manual.jurisdictionCourtsMunicipality === "string"
              ? manual.jurisdictionCourtsMunicipality : undefined,
          arrasPaymentAccount: manual.arrasPaymentAccount
            ? (manual.arrasPaymentAccount as { iban?: string; bankName?: string; holdersLine?: string })
            : undefined,
          timelines: manual.timelines
            ? (manual.timelines as Record<string, unknown>)
            : undefined,
          flags: manual.flags
            ? (manual.flags as Record<string, unknown>)
            : undefined,
        },
      };

      return buildArrasContractTemplateInputFromNeonAndInmovilla(arrasParams, d);
    }

    default: {
      const fallbackInput = { kind: "arras" as const, payload: {} } as unknown as ContractTemplateInput;
      return {
        ok: false,
        input: fallbackInput,
        issues: [{
          event: "DATOS_INCOMPLETOS",
          documentKind: documentKind,
          fieldPath: "documentKind",
          message: `No existe extractor para documentKind="${documentKind}".`,
        }],
        validationSignal: {
          event: {
            event: "DATOS_INCOMPLETOS",
            demandId,
            propertyCode,
            operationId,
            documentKind,
            missingRequiredCategories: [],
            issues: [],
          },
          commercialTask: {
            type: "CONTRACT_DATA_COMPLETION",
            demandId,
            propertyCode,
            operationId,
            assignedCommercialId: assignedCommercialId ?? "system",
            title: `Tipo de documento no soportado: ${documentKind}`,
            description: `No existe extractor para documentKind="${documentKind}".`,
            priority: "HIGH",
            status: "PENDING",
            missingRequiredCategories: [],
            issues: [],
          },
        },
        sources: {
          demandFoundInNeon: false,
          propertyFoundInNeon: false,
          propertyFoundInInmovilla: false,
          buyerClientFoundInInmovilla: false,
          sellerClientFoundInInmovilla: false,
        },
      };
    }
  }
}
