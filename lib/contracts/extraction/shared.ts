import { getClient, getProperty } from "@/lib/inmovilla/rest";
import { createInmovillaRestClient } from "@/lib/inmovilla/rest/client";
import type { Cliente, PropiedadCompleta } from "@/lib/inmovilla/rest/types";
import { prisma } from "@/lib/prisma";
import {
  CONTRACT_INCOMPLETE_EVENT,
  type ContractDocumentKind,
  type ContractFieldIssue,
  type MoneyEUR,
  type NaturalPerson,
  type PropertyRegistryData,
} from "@/types/contracts";

export type UnknownRecord = Record<string, unknown>;

export type ContractIncompleteCategory = "dni" | "domicilio" | "precio" | "plazos";

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

export interface ExtractionDeps {
  getDemandFromNeon: (demandId: string) => Promise<NeonDemandSource | null>;
  getPropertyFromNeon: (propertyCode: string) => Promise<NeonPropertySource | null>;
  getInmovillaProperty: (propertyCode: string) => Promise<PropiedadCompleta | null>;
  getInmovillaClient: (clientCode: number) => Promise<Cliente | null>;
}

export interface ContractIncompleteEventPayload {
  event: typeof CONTRACT_INCOMPLETE_EVENT;
  demandId: string;
  propertyCode: string;
  operationId: string;
  documentKind: ContractDocumentKind;
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

export interface ExtractionSources {
  demandFoundInNeon: boolean;
  propertyFoundInNeon: boolean;
  propertyFoundInInmovilla: boolean;
  buyerClientFoundInInmovilla: boolean;
  sellerClientFoundInInmovilla: boolean;
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

export function asRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as UnknownRecord;
}

export function cleanString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

export function cleanNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(",", ".").replace(/[^\d.-]/g, "");
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function pickFirstString(record: UnknownRecord, keys: readonly string[]): string {
  for (const key of keys) {
    const value = cleanString(record[key]);
    if (value) return value;
  }
  return "";
}

export function pickClientCode(record: UnknownRecord, keys: readonly string[]): number | null {
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

export function appendIssue(
  issues: ContractFieldIssue[],
  documentKind: ContractDocumentKind,
  fieldPath: string,
  message: string,
): void {
  issues.push({ event: CONTRACT_INCOMPLETE_EVENT, documentKind, fieldPath, message });
}

export function formatMoneyLiteralFallback(amount: number): string {
  return `${new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)} euros`;
}

export function toMoney(amount: number, literalOverride?: string): MoneyEUR {
  return {
    amount,
    literalEs: cleanString(literalOverride) || formatMoneyLiteralFallback(amount),
  };
}

export function buildStreetLine(input: {
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
  return [street, number, floor, door, staircase].filter(Boolean).join(" ").trim();
}

export function mapClientToPerson(
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

export const CADASTRAL_KEYS = [
  "rcatastral", "refcat", "refcatastral", "referencia_catastral",
  "referenciacatastral", "catastro", "catastral",
] as const;

export function resolvePropertyData(
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
      cleanString(restRecord.urbanDescriptionLine) || undefined,
    registryOfficeName:
      cleanString(overrides?.registryOfficeName) ||
      pickFirstString(restRecord, ["registro", "registro_oficina", "registry_office"]) || undefined,
    registryOfficeNumber:
      cleanString(overrides?.registryOfficeNumber) ||
      pickFirstString(restRecord, ["num_registro", "numero_registro", "registry_office_number"]) || undefined,
    fincaNumber:
      cleanString(overrides?.fincaNumber) ||
      pickFirstString(restRecord, ["finca", "finca_registral", "numero_finca"]) || undefined,
    cru: cleanString(overrides?.cru) || pickFirstString(restRecord, ["cru", "idufir"]) || undefined,
    tomo: cleanString(overrides?.tomo) || pickFirstString(restRecord, ["tomo"]) || undefined,
    libro: cleanString(overrides?.libro) || pickFirstString(restRecord, ["libro"]) || undefined,
    folio: cleanString(overrides?.folio) || pickFirstString(restRecord, ["folio"]) || undefined,
    inscripcion: cleanString(overrides?.inscripcion) || pickFirstString(restRecord, ["inscripcion"]) || undefined,
  };
}

export const BUYER_CLIENT_ID_KEYS = [
  "keycli", "cod_cli", "clientes-cod_cli", "clientes.cod_cli",
  "clientes-cod_clipriclave", "demandas-keycliclaveext",
] as const;

export const SELLER_CLIENT_ID_KEYS = [
  "keycli", "cod_cli", "codcli", "keypropietario", "key_propietario",
] as const;

// ---------------------------------------------------------------------------
// Incomplete signal builder
// ---------------------------------------------------------------------------

export function toMissingCategory(fieldPath: string): ContractIncompleteCategory | null {
  if (fieldPath.includes(".nationalId")) return "dni";
  if (fieldPath.includes(".fiscalAddress.") || fieldPath.startsWith("property.addressLine")) return "domicilio";
  if (
    fieldPath.startsWith("totalPurchasePrice.") ||
    fieldPath.startsWith("arrasAmount.") ||
    fieldPath.startsWith("remainderAtPublicDeed.") ||
    fieldPath.startsWith("offeredPrice.") ||
    fieldPath.startsWith("senalAmount.") ||
    fieldPath.startsWith("offerDeposit.") ||
    fieldPath.startsWith("listingPrice.")
  ) return "precio";
  if (fieldPath.startsWith("timelines.")) return "plazos";
  return null;
}

export function buildIncompleteValidationSignal(
  documentKind: ContractDocumentKind,
  demandId: string,
  propertyCode: string,
  operationId: string,
  assignedCommercialId: string,
  issues: ContractFieldIssue[],
): ContractIncompleteValidationSignal {
  const categories = new Set<ContractIncompleteCategory>();
  for (const issue of issues) {
    const category = toMissingCategory(issue.fieldPath);
    if (category) categories.add(category);
  }

  const missingRequiredCategories = [...categories];
  const commercialId = cleanString(assignedCommercialId) || "system";
  const missingLabel = missingRequiredCategories.length > 0
    ? missingRequiredCategories.join(", ")
    : "campos obligatorios";

  const kindLabel: Record<string, string> = {
    arras: "contrato de arras",
    senal_compra: "señal de compra",
    oferta_firme: "oferta en firme",
    anexo_mobiliario: "anexo mobiliario",
  };

  return {
    event: {
      event: CONTRACT_INCOMPLETE_EVENT,
      demandId,
      propertyCode,
      operationId,
      documentKind,
      missingRequiredCategories,
      issues,
    },
    commercialTask: {
      type: "CONTRACT_DATA_COMPLETION",
      demandId,
      propertyCode,
      operationId,
      assignedCommercialId: commercialId,
      title: `Completar datos obligatorios para ${kindLabel[documentKind] ?? documentKind} (${operationId})`,
      description: `Faltan datos obligatorios para generar contrato: ${missingLabel}.`,
      priority: "HIGH",
      status: "PENDING",
      missingRequiredCategories,
      issues,
    },
  };
}

// ---------------------------------------------------------------------------
// Default deps factory
// ---------------------------------------------------------------------------

export function createDefaultExtractionDeps(inmovillaToken?: string): ExtractionDeps {
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
