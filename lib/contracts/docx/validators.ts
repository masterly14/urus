import type {
  ArrasContractPayload,
  ContractFieldIssue,
  ContractTemplateInput,
} from "@/types/contracts";
import { CONTRACT_INCOMPLETE_EVENT } from "@/types/contracts";

function pushIssue(issues: ContractFieldIssue[], fieldPath: string, message: string) {
  issues.push({
    event: CONTRACT_INCOMPLETE_EVENT,
    documentKind: "arras",
    fieldPath,
    message,
  });
}

function validatePartyArray(
  issues: ContractFieldIssue[],
  role: "buyers" | "sellers",
  payload: ArrasContractPayload,
) {
  const parties = payload[role];

  if (!parties?.length) {
    pushIssue(issues, role, `Debe existir al menos una parte en ${role}.`);
    return;
  }

  parties.forEach((person, index) => {
    if (!person.fullName.trim()) {
      pushIssue(issues, `${role}.${index}.fullName`, "El nombre completo es obligatorio.");
    }
    if (!person.nationalId.trim()) {
      pushIssue(issues, `${role}.${index}.nationalId`, "El DNI/NIE es obligatorio.");
    }
    if (!person.fiscalAddress.streetLine.trim()) {
      pushIssue(issues, `${role}.${index}.fiscalAddress.streetLine`, "La calle es obligatoria.");
    }
    if (!person.fiscalAddress.municipality.trim()) {
      pushIssue(
        issues,
        `${role}.${index}.fiscalAddress.municipality`,
        "El municipio del domicilio fiscal es obligatorio.",
      );
    }
  });
}

export function validateArrasPayload(payload: ArrasContractPayload): ContractFieldIssue[] {
  const issues: ContractFieldIssue[] = [];

  validatePartyArray(issues, "buyers", payload);
  validatePartyArray(issues, "sellers", payload);

  if (!payload.property.addressLine.trim()) {
    pushIssue(issues, "property.addressLine", "La direccion del inmueble es obligatoria.");
  }
  if (!payload.property.municipality.trim()) {
    pushIssue(issues, "property.municipality", "El municipio del inmueble es obligatorio.");
  }
  if (!payload.property.cadastralReference.trim()) {
    pushIssue(issues, "property.cadastralReference", "La referencia catastral es obligatoria.");
  }

  if (payload.totalPurchasePrice.amount <= 0) {
    pushIssue(issues, "totalPurchasePrice.amount", "El precio total debe ser mayor de cero.");
  }
  if (!payload.totalPurchasePrice.literalEs.trim()) {
    pushIssue(
      issues,
      "totalPurchasePrice.literalEs",
      "El literal del precio total es obligatorio.",
    );
  }

  if (payload.arrasAmount.amount <= 0) {
    pushIssue(issues, "arrasAmount.amount", "El importe de arras debe ser mayor de cero.");
  }
  if (!payload.arrasAmount.literalEs.trim()) {
    pushIssue(issues, "arrasAmount.literalEs", "El literal del importe de arras es obligatorio.");
  }

  if (payload.remainderAtPublicDeed.amount < 0) {
    pushIssue(
      issues,
      "remainderAtPublicDeed.amount",
      "El resto a escritura no puede ser negativo.",
    );
  }

  if (!payload.arrasPaymentAccount.iban.trim()) {
    pushIssue(issues, "arrasPaymentAccount.iban", "El IBAN de cobro de arras es obligatorio.");
  }
  if (!payload.arrasPaymentAccount.bankName.trim()) {
    pushIssue(
      issues,
      "arrasPaymentAccount.bankName",
      "La entidad bancaria para cobro de arras es obligatoria.",
    );
  }
  if (!payload.arrasPaymentAccount.holdersLine.trim()) {
    pushIssue(
      issues,
      "arrasPaymentAccount.holdersLine",
      "La linea de titulares de la cuenta de arras es obligatoria.",
    );
  }

  if (!payload.timelines.maxDeedDateIso.trim()) {
    pushIssue(issues, "timelines.maxDeedDateIso", "La fecha maxima de escritura es obligatoria.");
  }
  if (!payload.timelines.maxKeysHandoverDateIso.trim()) {
    pushIssue(
      issues,
      "timelines.maxKeysHandoverDateIso",
      "La fecha maxima para entrega de llaves es obligatoria.",
    );
  }
  if (payload.timelines.convocatoriaNotaryMinNaturalDays <= 0) {
    pushIssue(
      issues,
      "timelines.convocatoriaNotaryMinNaturalDays",
      "La antelacion minima de convocatoria notarial debe ser mayor de cero.",
    );
  }

  if (!payload.jurisdiction.courtsMunicipality.trim()) {
    pushIssue(
      issues,
      "jurisdiction.courtsMunicipality",
      "El municipio de fuero es obligatorio.",
    );
  }

  return issues;
}

export function validateContractTemplateInput(input: ContractTemplateInput): ContractFieldIssue[] {
  if (input.kind !== "arras") {
    return [
      {
        event: CONTRACT_INCOMPLETE_EVENT,
        documentKind: input.kind,
        fieldPath: "kind",
        message: `La generacion DOCX actual solo soporta kind=arras. Recibido: ${input.kind}.`,
      },
    ];
  }

  return validateArrasPayload(input.payload);
}
