import type {
  ArrasContractPayload,
  ContractDocumentKind,
  ContractFieldIssue,
  ContractTemplateInput,
  NaturalPerson,
  OfertaFirmeContractPayload,
  SenalCompraContractPayload,
} from "@/types/contracts";
import { CONTRACT_INCOMPLETE_EVENT } from "@/types/contracts";

function pushIssue(
  issues: ContractFieldIssue[],
  kind: ContractDocumentKind,
  fieldPath: string,
  message: string,
) {
  issues.push({
    event: CONTRACT_INCOMPLETE_EVENT,
    documentKind: kind,
    fieldPath,
    message,
  });
}

function validatePersonArray(
  issues: ContractFieldIssue[],
  kind: ContractDocumentKind,
  label: string,
  persons: readonly NaturalPerson[] | undefined,
) {
  if (!persons?.length) {
    pushIssue(issues, kind, label, `Debe existir al menos una parte en ${label}.`);
    return;
  }

  persons.forEach((person, index) => {
    if (!person.fullName.trim()) {
      pushIssue(issues, kind, `${label}.${index}.fullName`, "El nombre completo es obligatorio.");
    }
    if (!person.nationalId.trim()) {
      pushIssue(issues, kind, `${label}.${index}.nationalId`, "El DNI/NIE es obligatorio.");
    }
    if (!person.fiscalAddress.streetLine.trim()) {
      pushIssue(issues, kind, `${label}.${index}.fiscalAddress.streetLine`, "La calle es obligatoria.");
    }
    if (!person.fiscalAddress.municipality.trim()) {
      pushIssue(
        issues,
        kind,
        `${label}.${index}.fiscalAddress.municipality`,
        "El municipio del domicilio fiscal es obligatorio.",
      );
    }
  });
}

function validatePerson(
  issues: ContractFieldIssue[],
  kind: ContractDocumentKind,
  label: string,
  person: NaturalPerson | undefined,
) {
  if (!person) {
    pushIssue(issues, kind, label, `${label} es obligatorio.`);
    return;
  }
  validatePersonArray(issues, kind, label, [person]);
}

// ── Arras ──────────────────────────────────────────────────────────────────────

export function validateArrasPayload(payload: ArrasContractPayload): ContractFieldIssue[] {
  const issues: ContractFieldIssue[] = [];
  const K: ContractDocumentKind = "arras";

  validatePersonArray(issues, K, "buyers", payload.buyers);
  validatePersonArray(issues, K, "sellers", payload.sellers);

  if (!payload.property.addressLine.trim()) {
    pushIssue(issues, K, "property.addressLine", "La direccion del inmueble es obligatoria.");
  }
  if (!payload.property.municipality.trim()) {
    pushIssue(issues, K, "property.municipality", "El municipio del inmueble es obligatorio.");
  }
  if (!payload.property.cadastralReference.trim()) {
    pushIssue(issues, K, "property.cadastralReference", "La referencia catastral es obligatoria.");
  }

  if (payload.totalPurchasePrice.amount <= 0) {
    pushIssue(issues, K, "totalPurchasePrice.amount", "El precio total debe ser mayor de cero.");
  }
  if (!payload.totalPurchasePrice.literalEs.trim()) {
    pushIssue(issues, K, "totalPurchasePrice.literalEs", "El literal del precio total es obligatorio.");
  }

  if (payload.arrasAmount.amount <= 0) {
    pushIssue(issues, K, "arrasAmount.amount", "El importe de arras debe ser mayor de cero.");
  }
  if (!payload.arrasAmount.literalEs.trim()) {
    pushIssue(issues, K, "arrasAmount.literalEs", "El literal del importe de arras es obligatorio.");
  }

  if (payload.remainderAtPublicDeed.amount < 0) {
    pushIssue(issues, K, "remainderAtPublicDeed.amount", "El resto a escritura no puede ser negativo.");
  }

  if (!payload.arrasPaymentAccount.iban.trim()) {
    pushIssue(issues, K, "arrasPaymentAccount.iban", "El IBAN de cobro de arras es obligatorio.");
  }
  if (!payload.arrasPaymentAccount.bankName.trim()) {
    pushIssue(issues, K, "arrasPaymentAccount.bankName", "La entidad bancaria para cobro de arras es obligatoria.");
  }
  if (!payload.arrasPaymentAccount.holdersLine.trim()) {
    pushIssue(issues, K, "arrasPaymentAccount.holdersLine", "La linea de titulares de la cuenta de arras es obligatoria.");
  }

  if (!payload.timelines.maxDeedDateIso.trim()) {
    pushIssue(issues, K, "timelines.maxDeedDateIso", "La fecha maxima de escritura es obligatoria.");
  }
  if (!payload.timelines.maxKeysHandoverDateIso.trim()) {
    pushIssue(issues, K, "timelines.maxKeysHandoverDateIso", "La fecha maxima para entrega de llaves es obligatoria.");
  }
  if (payload.timelines.convocatoriaNotaryMinNaturalDays <= 0) {
    pushIssue(issues, K, "timelines.convocatoriaNotaryMinNaturalDays", "La antelacion minima de convocatoria notarial debe ser mayor de cero.");
  }

  if (!payload.jurisdiction.courtsMunicipality.trim()) {
    pushIssue(issues, K, "jurisdiction.courtsMunicipality", "El municipio de fuero es obligatorio.");
  }

  return issues;
}

// ── Señal de compra ────────────────────────────────────────────────────────────

export function validateSenalCompraPayload(payload: SenalCompraContractPayload): ContractFieldIssue[] {
  const issues: ContractFieldIssue[] = [];
  const K: ContractDocumentKind = "senal_compra";

  validatePerson(issues, K, "purchaser", payload.purchaser);

  if (!payload.agency.representative.fullName.trim()) {
    pushIssue(issues, K, "agency.representative.fullName", "El representante de la agencia es obligatorio.");
  }
  if (!payload.agency.companyLegalName.trim()) {
    pushIssue(issues, K, "agency.companyLegalName", "La razon social de la agencia es obligatoria.");
  }
  if (!payload.agency.companyTaxId.trim()) {
    pushIssue(issues, K, "agency.companyTaxId", "El CIF de la agencia es obligatorio.");
  }
  if (!payload.agency.depositBankAccount.iban.trim()) {
    pushIssue(issues, K, "agency.depositBankAccount.iban", "El IBAN de deposito de la agencia es obligatorio.");
  }

  if (!payload.property.addressLine.trim()) {
    pushIssue(issues, K, "property.addressLine", "La direccion del inmueble es obligatoria.");
  }
  if (!payload.property.cadastralReference.trim()) {
    pushIssue(issues, K, "property.cadastralReference", "La referencia catastral es obligatoria.");
  }

  if (payload.senalAmount.amount <= 0) {
    pushIssue(issues, K, "senalAmount.amount", "El importe de senal debe ser mayor de cero.");
  }
  if (payload.offeredPrice.amount <= 0) {
    pushIssue(issues, K, "offeredPrice.amount", "El precio ofrecido debe ser mayor de cero.");
  }

  if (payload.timelines.businessDaysToArrasContract <= 0) {
    pushIssue(issues, K, "timelines.businessDaysToArrasContract", "Los dias habiles para firma de arras deben ser mayor de cero.");
  }
  if (payload.timelines.maxNaturalDaysToEscrituraFromSenalSignature <= 0) {
    pushIssue(issues, K, "timelines.maxNaturalDaysToEscrituraFromSenalSignature", "El plazo maximo para escritura debe ser mayor de cero.");
  }
  if (payload.timelines.convocatoriaNotaryMinNaturalDays <= 0) {
    pushIssue(issues, K, "timelines.convocatoriaNotaryMinNaturalDays", "La antelacion minima de convocatoria notarial debe ser mayor de cero.");
  }

  if (!payload.jurisdiction.courtsMunicipality.trim()) {
    pushIssue(issues, K, "jurisdiction.courtsMunicipality", "El municipio de fuero es obligatorio.");
  }

  return issues;
}

// ── Oferta en firme ────────────────────────────────────────────────────────────

export function validateOfertaFirmePayload(payload: OfertaFirmeContractPayload): ContractFieldIssue[] {
  const issues: ContractFieldIssue[] = [];
  const K: ContractDocumentKind = "oferta_firme";

  validatePersonArray(issues, K, "offerers", payload.offerers);

  if (!payload.agency.representative.fullName.trim()) {
    pushIssue(issues, K, "agency.representative.fullName", "El representante de la agencia es obligatorio.");
  }
  if (!payload.agency.companyLegalName.trim()) {
    pushIssue(issues, K, "agency.companyLegalName", "La razon social de la agencia es obligatoria.");
  }
  if (!payload.agency.companyTaxId.trim()) {
    pushIssue(issues, K, "agency.companyTaxId", "El CIF de la agencia es obligatorio.");
  }
  if (!payload.agency.depositBankAccount.iban.trim()) {
    pushIssue(issues, K, "agency.depositBankAccount.iban", "El IBAN de deposito de la agencia es obligatorio.");
  }

  if (!payload.property.addressLine.trim()) {
    pushIssue(issues, K, "property.addressLine", "La direccion del inmueble es obligatoria.");
  }
  if (!payload.property.cadastralReference.trim()) {
    pushIssue(issues, K, "property.cadastralReference", "La referencia catastral es obligatoria.");
  }

  if (payload.listingPrice.amount <= 0) {
    pushIssue(issues, K, "listingPrice.amount", "El precio de venta (listing) debe ser mayor de cero.");
  }
  if (payload.offeredPrice.amount <= 0) {
    pushIssue(issues, K, "offeredPrice.amount", "El precio ofrecido debe ser mayor de cero.");
  }
  if (payload.offerDeposit.amount <= 0) {
    pushIssue(issues, K, "offerDeposit.amount", "El deposito de oferta debe ser mayor de cero.");
  }
  if (payload.arrasAmountAfterAcceptance.amount <= 0) {
    pushIssue(issues, K, "arrasAmountAfterAcceptance.amount", "El importe de arras previsto debe ser mayor de cero.");
  }

  if (payload.timelines.offerValidityNaturalDays <= 0) {
    pushIssue(issues, K, "timelines.offerValidityNaturalDays", "La validez de la oferta en dias debe ser mayor de cero.");
  }
  if (payload.timelines.arrasSigningMaxNaturalDaysFromAcceptance <= 0) {
    pushIssue(issues, K, "timelines.arrasSigningMaxNaturalDaysFromAcceptance", "El plazo para firmar arras debe ser mayor de cero.");
  }
  if (payload.timelines.escrituraMaxNaturalDaysFromArrasSignature <= 0) {
    pushIssue(issues, K, "timelines.escrituraMaxNaturalDaysFromArrasSignature", "El plazo para escritura desde arras debe ser mayor de cero.");
  }

  if (!payload.jurisdiction.courtsMunicipality.trim()) {
    pushIssue(issues, K, "jurisdiction.courtsMunicipality", "El municipio de fuero es obligatorio.");
  }

  return issues;
}

// ── Dispatch ───────────────────────────────────────────────────────────────────

export function validateContractTemplateInput(input: ContractTemplateInput): ContractFieldIssue[] {
  switch (input.kind) {
    case "arras":
      return validateArrasPayload(input.payload);
    case "senal_compra":
      return validateSenalCompraPayload(input.payload);
    case "oferta_firme":
      return validateOfertaFirmePayload(input.payload);
    case "anexo_mobiliario":
      return [];
    default:
      return [
        {
          event: CONTRACT_INCOMPLETE_EVENT,
          documentKind: (input as ContractTemplateInput).kind,
          fieldPath: "kind",
          message: `Tipo de documento no soportado para validacion.`,
        },
      ];
  }
}
