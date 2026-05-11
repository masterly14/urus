import { getClient, getProperty } from "@/lib/inmovilla/rest";
import { createInmovillaRestClient } from "@/lib/inmovilla/rest/client";
import type { Cliente, PropiedadCompleta } from "@/lib/inmovilla/rest/types";
import { prisma } from "@/lib/prisma";
import {
  CONTRACT_INCOMPLETE_EVENT,
  type ArrasContractPayload,
  type ArrasLegalRegime,
  type ArrasTimelines,
  type ArrasTemplateFlags,
  type ContractFieldIssue,
  type ContractTemplateInput,
  type JurisdictionClause,
  type KeysHandoverMode,
  type MoneyEUR,
  type NaturalPerson,
  type PropertyRegistryData,
} from "@/types/contracts";
import { validateContractTemplateInput } from "../docx/validators";

type ArrasInput = Extract<ContractTemplateInput, { kind: "arras" }>;

const BUYER_CLIENT_ID_KEYS = [
  "keycli",
  "cod_cli",
  "clientes-cod_cli",
  "clientes.cod_cli",
  "clientes-cod_clipriclave",
  "demandas-keycliclaveext",
] as const;

const SELLER_CLIENT_ID_KEYS = [
  "keycli",
  "cod_cli",
  "codcli",
  "keypropietario",
  "key_propietario",
] as const;

const CADASTRAL_KEYS = [
  "rcatastral",
  "refcat",
  "refcatastral",
  "referencia_catastral",
  "referenciacatastral",
  "catastro",
  "catastral",
] as const;

type UnknownRecord = Record<string, unknown>;

export interface ArrasOperationData {
  operationId: string;
  assignedCommercialId?: string;
  totalPurchasePriceAmount: number;
  arrasAmountAmount: number;
  totalPurchasePriceLiteralEs?: string;
  arrasAmountLiteralEs?: string;
  remainderAtPublicDeedAmount?: number;
  remainderAtPublicDeedLiteralEs?: string;
  documentDateIso?: string;
  signPlace?: string;
  jurisdictionCourtsMunicipality?: string;
  arrasPaymentAccount?: {
    iban?: string;
    bankName?: string;
    holdersLine?: string;
  };
  timelines?: Partial<ArrasTimelines>;
  flags?: Partial<ArrasTemplateFlags>;
  propertyOverrides?: Partial<PropertyRegistryData>;
}

export type ContractIncompleteCategory = "dni" | "domicilio" | "precio" | "plazos";

export interface ContractIncompleteEventPayload {
  event: typeof CONTRACT_INCOMPLETE_EVENT;
  demandId: string;
  propertyCode: string;
  operationId: string;
  documentKind: "arras";
  missingRequiredCategories: ContractIncompleteCategory[];
  issues: ContractFieldIssue[];
}

export interface ContractDataCompletionTask {
  type: "CONTRACT_DATA_COMPLETION";
  demandId: string;
  propertyCode: string;
  operationId: string;
  assignedCommercialId: string;
  title: string;
  description: string;
  priority: "HIGH";
  status: "PENDING";
  missingRequiredCategories: ContractIncompleteCategory[];
  issues: ContractFieldIssue[];
}

export interface ContractIncompleteValidationSignal {
  event: ContractIncompleteEventPayload;
  commercialTask: ContractDataCompletionTask;
}

export interface BuildArrasPayloadParams {
  demandId: string;
  propertyCode: string;
  operation: ArrasOperationData;
  templateVersion?: string;
}

export interface NeonDemandSource {
  codigo: string;
  nombre: string;
  agente?: string;
  raw: UnknownRecord;
}

export interface NeonPropertySource {
  codigo: string;
  ciudad: string;
  titulo: string;
  raw: UnknownRecord;
}

export interface ArrasExtractionDeps {
  getDemandFromNeon: (demandId: string) => Promise<NeonDemandSource | null>;
  getPropertyFromNeon: (propertyCode: string) => Promise<NeonPropertySource | null>;
  getInmovillaProperty: (propertyCode: string) => Promise<PropiedadCompleta | null>;
  getInmovillaClient: (clientCode: number) => Promise<Cliente | null>;
}

export type BuildArrasPayloadResult =
  | {
      ok: true;
      input: ArrasInput;
      sources: {
        demandFoundInNeon: boolean;
        propertyFoundInNeon: boolean;
        propertyFoundInInmovilla: boolean;
        buyerClientFoundInInmovilla: boolean;
        sellerClientFoundInInmovilla: boolean;
      };
    }
  | {
      ok: false;
      input: ArrasInput;
      issues: ContractFieldIssue[];
      validationSignal: ContractIncompleteValidationSignal;
      sources: {
        demandFoundInNeon: boolean;
        propertyFoundInNeon: boolean;
        propertyFoundInInmovilla: boolean;
        buyerClientFoundInInmovilla: boolean;
        sellerClientFoundInInmovilla: boolean;
      };
    };

function asRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as UnknownRecord;
}

function cleanString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function cleanNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.replace(",", ".").replace(/[^\d.-]/g, "");
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pickFirstString(record: UnknownRecord, keys: readonly string[]): string {
  for (const key of keys) {
    const value = cleanString(record[key]);
    if (value) return value;
  }
  return "";
}

function pickClientCode(record: UnknownRecord, keys: readonly string[]): number | null {
  for (const key of keys) {
    const raw = record[key];
    const asNumber = cleanNumber(raw);
    if (asNumber !== null && asNumber > 0) return Math.trunc(asNumber);
    const asText = cleanString(raw);
    if (!asText) continue;
    const onlyDigits = asText.replace(/\D/g, "");
    if (!onlyDigits) continue;
    const parsed = Number(onlyDigits);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function appendIssue(
  issues: ContractFieldIssue[],
  fieldPath: string,
  message: string,
): void {
  issues.push({
    event: CONTRACT_INCOMPLETE_EVENT,
    documentKind: "arras",
    fieldPath,
    message,
  });
}

function formatMoneyLiteralFallback(amount: number): string {
  return `${new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)} euros`;
}

function toMoney(amount: number, literalOverride?: string): MoneyEUR {
  return {
    amount,
    literalEs: cleanString(literalOverride) || formatMoneyLiteralFallback(amount),
  };
}

function buildStreetLine(input: {
  street?: unknown;
  number?: unknown;
  floor?: unknown;
  door?: unknown;
  staircase?: unknown;
}): string {
  const street = cleanString(input.street);
  const number = cleanString(input.number);
  const floor = cleanString(input.floor);
  const door = cleanString(input.door);
  const staircase = cleanString(input.staircase);
  const pieces = [street, number, floor, door, staircase].filter(Boolean);
  return pieces.join(" ").trim();
}

function mapClientToPerson(
  client: Cliente | null,
  fallbackName: string,
  fallbackMunicipality: string,
): NaturalPerson {
  const firstName = cleanString(client?.nombre);
  const lastName = cleanString(client?.apellidos);
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim() || fallbackName;

  const streetLine =
    buildStreetLine({
      street: client?.calle,
      number: client?.numero,
      floor: client?.planta,
      door: client?.puerta,
      staircase: client?.escalera,
    }) || "";

  const municipality =
    cleanString(client?.localidad) || cleanString(client?.provincia) || fallbackMunicipality;

  return {
    fullName,
    nationalId: cleanString(client?.nif),
    fiscalAddress: {
      streetLine,
      postalCode: cleanString(client?.cp) || undefined,
      municipality,
      province: cleanString(client?.provincia) || undefined,
    },
  };
}

function resolvePropertyData(
  inmovillaProperty: PropiedadCompleta | null,
  neonProperty: NeonPropertySource | null,
  overrides?: Partial<PropertyRegistryData>,
): PropertyRegistryData {
  const restRecord = asRecord(inmovillaProperty);
  const neonRaw = asRecord(neonProperty?.raw);
  const addressLine =
    cleanString(overrides?.addressLine) ||
    buildStreetLine({
      street: inmovillaProperty?.calle,
      number: inmovillaProperty?.numero,
      floor: inmovillaProperty?.planta,
    }) ||
    cleanString(neonRaw.calle) ||
    cleanString(neonProperty?.titulo);

  const municipality =
    cleanString(overrides?.municipality) ||
    cleanString(restRecord.localidad) ||
    cleanString(restRecord.ciudad) ||
    cleanString(neonProperty?.ciudad);

  const cadastralReference =
    cleanString(overrides?.cadastralReference) || pickFirstString(restRecord, CADASTRAL_KEYS);

  return {
    addressLine,
    municipality,
    cadastralReference,
    urbanDescriptionLine:
      cleanString(overrides?.urbanDescriptionLine) ||
      cleanString(restRecord.urbanDescriptionLine) ||
      undefined,
    registryOfficeName:
      cleanString(overrides?.registryOfficeName) ||
      pickFirstString(restRecord, ["registro", "registro_oficina", "registry_office"]) ||
      undefined,
    registryOfficeNumber:
      cleanString(overrides?.registryOfficeNumber) ||
      pickFirstString(restRecord, ["num_registro", "numero_registro", "registry_office_number"]) ||
      undefined,
    fincaNumber:
      cleanString(overrides?.fincaNumber) ||
      pickFirstString(restRecord, ["finca", "finca_registral", "numero_finca"]) ||
      undefined,
    cru:
      cleanString(overrides?.cru) ||
      pickFirstString(restRecord, ["cru", "idufir"]) ||
      undefined,
    tomo:
      cleanString(overrides?.tomo) ||
      pickFirstString(restRecord, ["tomo"]) ||
      undefined,
    libro:
      cleanString(overrides?.libro) ||
      pickFirstString(restRecord, ["libro"]) ||
      undefined,
    folio:
      cleanString(overrides?.folio) ||
      pickFirstString(restRecord, ["folio"]) ||
      undefined,
    inscripcion:
      cleanString(overrides?.inscripcion) ||
      pickFirstString(restRecord, ["inscripcion"]) ||
      undefined,
  };
}

function defaultFlags(operation: ArrasOperationData): ArrasTemplateFlags {
  const regime = operation.flags?.arrasRegime;
  const keysHandover = operation.flags?.keysHandover;
  const validitySubjectToSellerReceipt = operation.flags?.validitySubjectToSellerReceipt;
  return {
    arrasRegime: (regime === "confirmatoria" ? "confirmatoria" : "penitencial") as ArrasLegalRegime,
    keysHandover:
      (keysHandover ?? "same_day_as_deed") as KeysHandoverMode,
    validitySubjectToSellerReceipt: Boolean(validitySubjectToSellerReceipt),
  };
}

function defaultTimelines(operation: ArrasOperationData, documentDateIso: string): ArrasTimelines {
  const maxDeedDateIso = cleanString(operation.timelines?.maxDeedDateIso);
  const maxKeysHandoverDateIso = cleanString(operation.timelines?.maxKeysHandoverDateIso);
  const convocatoriaNotaryMinNaturalDays =
    typeof operation.timelines?.convocatoriaNotaryMinNaturalDays === "number"
      ? operation.timelines.convocatoriaNotaryMinNaturalDays
      : 0;

  return {
    maxDeedDateIso,
    maxKeysHandoverDateIso,
    convocatoriaNotaryMinNaturalDays,
  };
}

function toMissingCategory(fieldPath: string): ContractIncompleteCategory | null {
  if (fieldPath.includes(".nationalId")) return "dni";
  if (fieldPath.includes(".fiscalAddress.") || fieldPath.startsWith("property.addressLine")) {
    return "domicilio";
  }
  if (
    fieldPath.startsWith("totalPurchasePrice.") ||
    fieldPath.startsWith("arrasAmount.") ||
    fieldPath.startsWith("remainderAtPublicDeed.")
  ) {
    return "precio";
  }
  if (fieldPath.startsWith("timelines.")) return "plazos";
  return null;
}

function buildContractIncompleteValidationSignal(
  params: BuildArrasPayloadParams,
  issues: ContractFieldIssue[],
): ContractIncompleteValidationSignal {
  const categories = new Set<ContractIncompleteCategory>();
  for (const issue of issues) {
    const category = toMissingCategory(issue.fieldPath);
    if (category) categories.add(category);
  }

  const missingRequiredCategories = [...categories];
  const assignedCommercialId = cleanString(params.operation.assignedCommercialId) || "system";
  const missingLabel = missingRequiredCategories.length > 0
    ? missingRequiredCategories.join(", ")
    : "campos obligatorios";

  return {
    event: {
      event: CONTRACT_INCOMPLETE_EVENT,
      demandId: params.demandId,
      propertyCode: params.propertyCode,
      operationId: params.operation.operationId,
      documentKind: "arras",
      missingRequiredCategories,
      issues,
    },
    commercialTask: {
      type: "CONTRACT_DATA_COMPLETION",
      demandId: params.demandId,
      propertyCode: params.propertyCode,
      operationId: params.operation.operationId,
      assignedCommercialId,
      title: `Completar datos obligatorios para contrato de arras (${params.operation.operationId})`,
      description: `Faltan datos obligatorios para generar contrato: ${missingLabel}.`,
      priority: "HIGH",
      status: "PENDING",
      missingRequiredCategories,
      issues,
    },
  };
}

export function createDefaultArrasExtractionDeps(
  inmovillaToken?: string,
): ArrasExtractionDeps {
  const restClient = createInmovillaRestClient(
    inmovillaToken ? { token: inmovillaToken } : undefined,
  );

  return {
    async getDemandFromNeon(demandId: string): Promise<NeonDemandSource | null> {
      const [current, snapshot] = await Promise.all([
        prisma.demandCurrent.findUnique({
          where: { codigo: demandId },
          select: { codigo: true, nombre: true, agente: true },
        }),
        prisma.demandSnapshot.findUnique({
          where: { codigo: demandId },
          select: { raw: true },
        }),
      ]);
      if (!current && !snapshot) return null;
      return {
        codigo: current?.codigo ?? demandId,
        nombre: current?.nombre ?? "",
        agente: cleanString(current?.agente),
        raw: asRecord(snapshot?.raw),
      };
    },
    async getPropertyFromNeon(propertyCode: string): Promise<NeonPropertySource | null> {
      const [current, snapshot] = await Promise.all([
        prisma.propertyCurrent.findUnique({
          where: { codigo: propertyCode },
          select: { codigo: true, ciudad: true, titulo: true },
        }),
        prisma.propertySnapshot.findUnique({
          where: { codigo: propertyCode },
          select: { raw: true },
        }),
      ]);
      if (!current && !snapshot) return null;
      return {
        codigo: current?.codigo ?? propertyCode,
        ciudad: current?.ciudad ?? "",
        titulo: current?.titulo ?? "",
        raw: asRecord(snapshot?.raw),
      };
    },
    async getInmovillaProperty(propertyCode: string): Promise<PropiedadCompleta | null> {
      return getProperty(restClient, propertyCode);
    },
    async getInmovillaClient(clientCode: number): Promise<Cliente | null> {
      try {
        return await getClient(restClient, clientCode);
      } catch {
        return null;
      }
    },
  };
}

export async function buildArrasContractTemplateInputFromNeonAndInmovilla(
  params: BuildArrasPayloadParams,
  deps: ArrasExtractionDeps,
): Promise<BuildArrasPayloadResult> {
  const extractionIssues: ContractFieldIssue[] = [];
  const [neonDemand, neonProperty, inmovillaProperty] = await Promise.all([
    deps.getDemandFromNeon(params.demandId),
    deps.getPropertyFromNeon(params.propertyCode),
    deps.getInmovillaProperty(params.propertyCode),
  ]);

  if (!neonDemand) {
    appendIssue(
      extractionIssues,
      "sources.neon.demand",
      `No se encontraron datos de demanda en Neon para demandId=${params.demandId}.`,
    );
  }

  if (!neonProperty) {
    appendIssue(
      extractionIssues,
      "sources.neon.property",
      `No se encontraron datos de inmueble en Neon para propertyCode=${params.propertyCode}.`,
    );
  }

  if (!inmovillaProperty) {
    appendIssue(
      extractionIssues,
      "sources.inmovilla.property",
      `No se encontraron datos de inmueble en Inmovilla para propertyCode=${params.propertyCode}.`,
    );
  }

  const demandRaw = asRecord(neonDemand?.raw);
  const propertyRaw = asRecord(neonProperty?.raw);
  const inmovillaPropertyRaw = asRecord(inmovillaProperty);

  const buyerClientCode = pickClientCode(demandRaw, BUYER_CLIENT_ID_KEYS);
  const sellerClientCode =
    pickClientCode(inmovillaPropertyRaw, SELLER_CLIENT_ID_KEYS) ??
    pickClientCode(propertyRaw, SELLER_CLIENT_ID_KEYS);

  if (!buyerClientCode) {
    appendIssue(
      extractionIssues,
      "sources.inmovilla.buyerClientCode",
      "No se pudo resolver el cod_cli del comprador desde la demanda en Neon.",
    );
  }

  if (!sellerClientCode) {
    appendIssue(
      extractionIssues,
      "sources.inmovilla.sellerClientCode",
      "No se pudo resolver el cod_cli del vendedor desde el inmueble (Neon/Inmovilla).",
    );
  }

  const [buyerClient, sellerClient] = await Promise.all([
    buyerClientCode ? deps.getInmovillaClient(buyerClientCode) : Promise.resolve(null),
    sellerClientCode ? deps.getInmovillaClient(sellerClientCode) : Promise.resolve(null),
  ]);

  if (buyerClientCode && !buyerClient) {
    appendIssue(
      extractionIssues,
      "sources.inmovilla.buyerClient",
      `No se encontró el cliente comprador en Inmovilla (cod_cli=${buyerClientCode}).`,
    );
  }
  if (sellerClientCode && !sellerClient) {
    appendIssue(
      extractionIssues,
      "sources.inmovilla.sellerClient",
      `No se encontró el cliente vendedor en Inmovilla (cod_cli=${sellerClientCode}).`,
    );
  }

  const documentDateIso = cleanString(params.operation.documentDateIso) || new Date().toISOString().slice(0, 10);
  const totalPurchasePriceAmount = Math.max(0, params.operation.totalPurchasePriceAmount);
  const arrasAmountAmount = Math.max(0, params.operation.arrasAmountAmount);
  const remainderAtPublicDeedAmount =
    params.operation.remainderAtPublicDeedAmount ??
    Math.max(0, totalPurchasePriceAmount - arrasAmountAmount);

  const buyer = mapClientToPerson(
    buyerClient,
    cleanString(neonDemand?.nombre),
    cleanString(neonProperty?.ciudad),
  );
  const seller = mapClientToPerson(
    sellerClient,
    cleanString(propertyRaw.propietario) || "Vendedor pendiente",
    cleanString(neonProperty?.ciudad),
  );

  const arrasPayload: ArrasContractPayload = {
    documentDateIso,
    signPlace: cleanString(params.operation.signPlace) || cleanString(neonProperty?.ciudad),
    buyers: [buyer],
    sellers: [seller],
    property: resolvePropertyData(inmovillaProperty, neonProperty, params.operation.propertyOverrides),
    totalPurchasePrice: toMoney(
      totalPurchasePriceAmount,
      params.operation.totalPurchasePriceLiteralEs,
    ),
    arrasAmount: toMoney(arrasAmountAmount, params.operation.arrasAmountLiteralEs),
    remainderAtPublicDeed: toMoney(
      remainderAtPublicDeedAmount,
      params.operation.remainderAtPublicDeedLiteralEs,
    ),
    arrasPaymentAccount: {
      iban: cleanString(params.operation.arrasPaymentAccount?.iban),
      bankName: cleanString(params.operation.arrasPaymentAccount?.bankName),
      holdersLine: cleanString(params.operation.arrasPaymentAccount?.holdersLine),
    },
    timelines: defaultTimelines(params.operation, documentDateIso),
    jurisdiction: {
      courtsMunicipality:
        cleanString(params.operation.jurisdictionCourtsMunicipality) ||
        cleanString(neonProperty?.ciudad),
    } as JurisdictionClause,
    flags: defaultFlags(params.operation),
  };

  const input: ArrasInput = {
    kind: "arras",
    templateVersion: params.templateVersion,
    payload: arrasPayload,
  };

  const validationIssues = validateContractTemplateInput(input);
  const issues = [...extractionIssues, ...validationIssues];
  const sources = {
    demandFoundInNeon: Boolean(neonDemand),
    propertyFoundInNeon: Boolean(neonProperty),
    propertyFoundInInmovilla: Boolean(inmovillaProperty),
    buyerClientFoundInInmovilla: Boolean(buyerClient),
    sellerClientFoundInInmovilla: Boolean(sellerClient),
  };

  if (issues.length > 0) {
    const validationSignal = buildContractIncompleteValidationSignal(params, issues);
    return {
      ok: false,
      input,
      issues,
      validationSignal,
      sources,
    };
  }

  return {
    ok: true,
    input,
    sources,
  };
}
