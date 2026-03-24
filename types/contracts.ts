/**
 * Motor de plantillas M8 — modelo de datos (Día 13, ítem 1).
 * Basado en los modelos: oferta en firme (pre-señal), señal de compra, contrato de arras (+ anexo mobiliario).
 * La generación docx y la extracción desde Neon/Inmovilla son ítems posteriores del mismo día.
 */

// --- Clasificación de documentos ---

export type ContractDocumentKind =
  | "oferta_firme"
  | "senal_compra"
  | "arras"
  | "anexo_mobiliario";

/** Régimen de arras para textos legales coherentes (penitencial vs confirmatoria). */
export type ArrasLegalRegime = "penitencial" | "confirmatoria";

/** Entrega de llaves respecto a la escritura. */
export type KeysHandoverMode =
  | "same_day_as_deed"
  | "by_agreement_same_as_deed_when_occurs"
  | "separate_agreed_date";

// --- Partes y datos comunes ---

export interface PostalAddress {
  streetLine: string;
  postalCode?: string;
  municipality: string;
  province?: string;
}

export interface NaturalPerson {
  fullName: string;
  nationalId: string;
  fiscalAddress: PostalAddress;
}

export interface BankAccount {
  iban: string;
  bankName: string;
  /** Texto humano para la escritura (titulares). */
  holdersLine: string;
}

export interface AgencyParty {
  representative: NaturalPerson;
  companyLegalName: string;
  companyTaxId: string;
  companyMunicipality: string;
  /** Cuenta de depósito de oferta/señal en plantillas actuales. */
  depositBankAccount: BankAccount;
}

/** Datos registrales / catastrales para cláusulas de finca. */
export interface PropertyRegistryData {
  addressLine: string;
  municipality: string;
  cadastralReference: string;
  /** Descripción tipo inmueble en arras (ej. URBANA: …). */
  urbanDescriptionLine?: string;
  registryOfficeName?: string;
  registryOfficeNumber?: string;
  fincaNumber?: string;
  cru?: string;
  tomo?: string;
  libro?: string;
  folio?: string;
  inscripcion?: string;
}

/** Importe en euros con literal para documentos. */
export interface MoneyEUR {
  amount: number;
  literalEs: string;
}

export interface JurisdictionClause {
  courtsMunicipality: string;
}

// --- Honorarios (diferencia entre señal fija vs oferta %) ---

export type AgencyFees =
  | {
      model: "fixed_net";
      netAmount: MoneyEUR;
      vatRatePercent: number;
      devengo: "firma_arras";
    }
  | {
      model: "percent_of_final_price";
      percentOfFinalPrice: number;
      vatRatePercent: number;
      devengo: "firma_arras";
    };

// --- Plazos por tipo de contrato ---

export interface OfertaFirmeTimelines {
  /** P. ej. 3 días naturales de validez de la oferta desde la firma. */
  offerValidityNaturalDays: number;
  /** Plazo máximo para firmar arras desde la aceptación. */
  arrasSigningMaxNaturalDaysFromAcceptance: number;
  /** Plazo máximo para escritura desde la firma del contrato de arras. */
  escrituraMaxNaturalDaysFromArrasSignature: number;
}

export interface SenalCompraTimelines {
  businessDaysToArrasContract: number;
  maxNaturalDaysToEscrituraFromSenalSignature: number;
  convocatoriaNotaryMinNaturalDays: number;
}

export interface ArrasTimelines {
  /** Fecha tope para escritura (plantilla puede usar fecha absoluta). */
  maxDeedDateIso: string;
  maxKeysHandoverDateIso: string;
  convocatoriaNotaryMinNaturalDays: number;
}

// --- Flags / condicionales del motor ---

export interface OfertaFirmeTemplateFlags {
  /** Incluye bloque de aceptación/rechazo por la propiedad (modelo actual). */
  includePropertyAcceptanceSection: boolean;
}

export interface SenalCompraTemplateFlags {
  includeFinancingFallbackClause: boolean;
  keysHandover: KeysHandoverMode;
}

export interface ArrasTemplateFlags {
  arrasRegime: ArrasLegalRegime;
  keysHandover: KeysHandoverMode;
  /** Supeditar validez al cobro efectivo por el vendedor. */
  validitySubjectToSellerReceipt: boolean;
}

export interface FurnitureAnnexTemplateFlags {
  /** Si false, el anexo declara ausencia de mobiliario negociado. */
  hasFurniture: boolean;
}

// --- Payloads por documento ---

export interface OfertaFirmeContractPayload {
  documentDateIso: string;
  signPlace: string;
  agency: AgencyParty;
  offerers: [NaturalPerson, ...NaturalPerson[]];
  property: PropertyRegistryData;
  listingPrice: MoneyEUR;
  offeredPrice: MoneyEUR;
  offerDeposit: MoneyEUR;
  /** Importe de arras previsto tras aceptación (texto segundo párrafo). */
  arrasAmountAfterAcceptance: MoneyEUR;
  timelines: OfertaFirmeTimelines;
  fees: AgencyFees;
  jurisdiction: JurisdictionClause;
  flags: OfertaFirmeTemplateFlags;
}

export interface SenalCompraContractPayload {
  documentDateIso: string;
  signPlace: string;
  agency: AgencyParty;
  purchaser: NaturalPerson;
  property: Pick<PropertyRegistryData, "addressLine" | "municipality" | "cadastralReference">;
  senalAmount: MoneyEUR;
  offeredPrice: MoneyEUR;
  timelines: SenalCompraTimelines;
  fees: AgencyFees;
  jurisdiction: JurisdictionClause;
  flags: SenalCompraTemplateFlags;
}

export interface ArrasContractPayload {
  documentDateIso: string;
  signPlace: string;
  buyers: [NaturalPerson, ...NaturalPerson[]];
  sellers: [NaturalPerson, ...NaturalPerson[]];
  property: PropertyRegistryData;
  totalPurchasePrice: MoneyEUR;
  arrasAmount: MoneyEUR;
  remainderAtPublicDeed: MoneyEUR;
  arrasPaymentAccount: BankAccount;
  timelines: ArrasTimelines;
  /** Importe doble arras para cláusula de rescisión vendedor (derivable de arrasAmount × 2). */
  doubleArrasAmount?: MoneyEUR;
  jurisdiction: JurisdictionClause;
  flags: ArrasTemplateFlags;
}

export interface FurnitureAnnexItem {
  description: string;
  quantity: number;
  /** Incluido en precio de compraventa o no. */
  includedInPurchasePrice: boolean;
  estimatedValueEur?: MoneyEUR;
}

export interface FurnitureAnnexPayload {
  documentDateIso: string;
  signPlace: string;
  operationRef: string;
  propertyAddressLine: string;
  partiesLine: string;
  items: FurnitureAnnexItem[];
  flags: FurnitureAnnexTemplateFlags;
}

// --- Entrada unificada al motor (discriminada por kind) ---

export type ContractTemplateInput =
  | { kind: "oferta_firme"; templateVersion?: string; payload: OfertaFirmeContractPayload }
  | { kind: "senal_compra"; templateVersion?: string; payload: SenalCompraContractPayload }
  | { kind: "arras"; templateVersion?: string; payload: ArrasContractPayload }
  | { kind: "anexo_mobiliario"; templateVersion?: string; payload: FurnitureAnnexPayload };

export const DEFAULT_CONTRACT_TEMPLATE_VERSION = "2025.03.m8-v1" as const;
export type ContractTemplateVersion = typeof DEFAULT_CONTRACT_TEMPLATE_VERSION | string;

// --- Bloques reutilizables entre plantillas (composición) ---

export type SharedClauseBlockId =
  | "gastos_itp_iva_plusvalia"
  | "fuero_jurisdiccion"
  | "penitencial_desistimiento_basico"
  | "libre_cargas_cancelacion_propiedad"
  | "libre_cargas_declaracion_vendedor"
  | "estado_visitado_cuerpo_cierto"
  | "arras_convocatoria_rescision_7_dias"
  | "entrega_llaves_y_resto_precio";

export interface ClauseBlockSelection {
  include: SharedClauseBlockId[];
}

// --- Validación / eventos (Día 13 ítem 4; tipos listos para el extractor) ---

export const CONTRACT_INCOMPLETE_EVENT = "DATOS_INCOMPLETOS" as const;

export interface ContractFieldIssue {
  event: typeof CONTRACT_INCOMPLETE_EVENT;
  documentKind: ContractDocumentKind;
  /** Ruta estable para logging y tareas comerciales (notación punto). */
  fieldPath: string;
  message: string;
}
