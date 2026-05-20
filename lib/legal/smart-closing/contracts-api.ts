import { z } from "zod";
import type { ContractTemplateInput } from "@/types/contracts";
import { additionalClausesDocSchema } from "@/lib/contracts/additional-clauses/schema";
import type { AdditionalClausesDoc } from "@/lib/contracts/additional-clauses/types";
import { sectionAddendumsListSchema } from "@/lib/contracts/section-addendums/schema";
import type { SectionAddendumsList } from "@/lib/contracts/section-addendums/types";

export type { ContractTemplateInput } from "@/types/contracts";

export const contractTemplateInputSchema: z.ZodType<ContractTemplateInput> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("arras"), templateVersion: z.string().optional(), payload: z.any() }),
  z.object({ kind: z.literal("oferta_firme"), templateVersion: z.string().optional(), payload: z.any() }),
  z.object({ kind: z.literal("senal_compra"), templateVersion: z.string().optional(), payload: z.any() }),
  z.object({ kind: z.literal("anexo_mobiliario"), templateVersion: z.string().optional(), payload: z.any() }),
]);

export interface SmartClosingContractDetailDto {
  id: string;
  operationId: string;
  propertyCode: string;
  documentKind: string;
  status: string;
  templateVersion: string | null;
  cloudinaryUrl: string | null;
  createdAt: string;
  updatedAt: string;
  contractTemplateInput: ContractTemplateInput;
  additionalClausesDoc: AdditionalClausesDoc | null;
  additionalClausesUpdatedAt: string | null;
  sectionAddendums: SectionAddendumsList;
  sectionAddendumsUpdatedAt: string | null;
  parties: Array<{
    role: string;
    fullName: string;
    email: string | null;
    phone: string | null;
  }>;
}

export interface SmartClosingVersionDto {
  id: string;
  occurredAt: string;
  templateVersion: string | null;
  summary: string;
  appliedSummaries: string[];
  confidence: number | null;
  ambiguousPoints: string[];
  contractInput?: ContractTemplateInput;
}

type LegalDocumentLike = {
  id: string;
  operationId: string;
  propertyCode: string;
  documentKind: string;
  status: string;
  templateVersion: string | null;
  cloudinaryUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  contractInput: unknown;
  additionalClausesDoc?: unknown;
  additionalClausesUpdatedAt?: Date | null;
  sectionAddendums?: unknown;
  sectionAddendumsUpdatedAt?: Date | null;
  parties?: Array<{
    role: string;
    fullName: string;
    email: string | null;
    phone: string | null;
  }>;
};

type VersionEventLike = {
  id: string;
  occurredAt: Date;
  payload: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeSmartClosingContractDetail(
  doc: LegalDocumentLike,
): SmartClosingContractDetailDto {
  const parsedInput = contractTemplateInputSchema.safeParse(doc.contractInput);
  if (!parsedInput.success) {
    throw new Error("LegalDocument.contractInput inválido o ausente para Smart Closing");
  }

  // Si el JSON persistido no cumple el subset, lo descartamos silenciosamente:
  // no queremos que un documento corrupto tumbe toda la carga del contrato.
  const parsedClauses = doc.additionalClausesDoc
    ? additionalClausesDocSchema.safeParse(doc.additionalClausesDoc)
    : null;
  const parsedAddendums = doc.sectionAddendums
    ? sectionAddendumsListSchema.safeParse(doc.sectionAddendums)
    : null;

  return {
    id: doc.id,
    operationId: doc.operationId,
    propertyCode: doc.propertyCode,
    documentKind: doc.documentKind,
    status: doc.status,
    templateVersion: doc.templateVersion,
    cloudinaryUrl: doc.cloudinaryUrl,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    contractTemplateInput: parsedInput.data,
    additionalClausesDoc: parsedClauses && parsedClauses.success ? parsedClauses.data : null,
    additionalClausesUpdatedAt: doc.additionalClausesUpdatedAt
      ? doc.additionalClausesUpdatedAt.toISOString()
      : null,
    sectionAddendums:
      parsedAddendums && parsedAddendums.success ? parsedAddendums.data : [],
    sectionAddendumsUpdatedAt: doc.sectionAddendumsUpdatedAt
      ? doc.sectionAddendumsUpdatedAt.toISOString()
      : null,
    parties: (doc.parties ?? []).map((party) => ({
      role: party.role,
      fullName: party.fullName,
      email: party.email,
      phone: party.phone,
    })),
  };
}

export function normalizeSmartClosingVersionEvent(
  event: VersionEventLike,
): SmartClosingVersionDto | null {
  if (!isRecord(event.payload)) return null;

  const templateVersion =
    typeof event.payload.nextTemplateVersion === "string"
      ? event.payload.nextTemplateVersion
      : typeof event.payload.templateVersion === "string"
        ? event.payload.templateVersion
        : null;

  const appliedSummaries = Array.isArray(event.payload.appliedSummaries)
    ? event.payload.appliedSummaries.filter((item): item is string => typeof item === "string")
    : [];

  const patch = isRecord(event.payload.patch) ? event.payload.patch : null;
  const confidence = patch && typeof patch.confidence === "number" ? patch.confidence : null;
  const ambiguousPoints =
    patch && Array.isArray(patch.ambiguousPoints)
      ? patch.ambiguousPoints.filter((item): item is string => typeof item === "string")
      : [];

  const contractInputParsed = contractTemplateInputSchema.safeParse(event.payload.contractInput);

  return {
    id: event.id,
    occurredAt: event.occurredAt.toISOString(),
    templateVersion,
    summary:
      appliedSummaries.join(" · ") ||
      ambiguousPoints[0] ||
      "Versión del contrato sin resumen estructurado",
    appliedSummaries,
    confidence,
    ambiguousPoints,
    ...(contractInputParsed.success ? { contractInput: contractInputParsed.data } : {}),
  };
}
