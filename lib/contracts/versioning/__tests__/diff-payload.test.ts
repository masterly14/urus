import { describe, expect, it } from "vitest";
import type { ContractTemplateInput } from "@/types/contracts";
import { diffContractTemplatePayload } from "../diff-payload";

function arrasInput(
  overrides?: Partial<Extract<ContractTemplateInput, { kind: "arras" }>["payload"]>,
): Extract<ContractTemplateInput, { kind: "arras" }> {
  const base = {
    documentDateIso: "2026-05-21",
    signPlace: "Córdoba",
    buyers: [
      {
        fullName: "Ana",
        nationalId: "1A",
        fiscalAddress: { streetLine: "S1", municipality: "M" },
      },
    ],
    sellers: [
      {
        fullName: "José",
        nationalId: "2B",
        fiscalAddress: { streetLine: "S2", municipality: "M" },
      },
    ],
    property: {
      addressLine: "Calle 1",
      municipality: "M",
      cadastralReference: "CAT",
      registryOfficeName: "R",
      registryOfficeNumber: "1",
      fincaNumber: "F",
      cru: "C",
    },
    totalPurchasePrice: { amount: 100_000, literalEs: "cien mil euros" },
    arrasAmount: { amount: 10_000, literalEs: "diez mil euros" },
    remainderAtPublicDeed: { amount: 90_000, literalEs: "noventa mil euros" },
    arrasPaymentAccount: {
      iban: "ES00",
      bankName: "B",
      holdersLine: "H",
    },
    timelines: {
      maxDeedDateIso: "2026-08-21",
      maxKeysHandoverDateIso: "2026-08-21",
      convocatoriaNotaryMinNaturalDays: 7,
    },
    jurisdiction: { courtsMunicipality: "M" },
    flags: {
      arrasRegime: "penitencial" as const,
      keysHandover: "same_day_as_deed" as const,
      validitySubjectToSellerReceipt: true,
    },
  };
  return {
    kind: "arras",
    templateVersion: "OP-1_Arras_v1",
    payload: { ...base, ...overrides },
  };
}

describe("diffContractTemplatePayload", () => {
  it("detecta cambio de importe en arras", () => {
    const a = arrasInput();
    const b = arrasInput({
      arrasAmount: { amount: 12_000, literalEs: "doce mil euros" },
    });
    const d = diffContractTemplatePayload(a, b);
    expect(d.some((x) => x.path.startsWith("payload.arrasAmount"))).toBe(true);
    expect(d.find((x) => x.path === "payload.arrasAmount.amount")?.after).toBe(12_000);
  });

  it("devuelve kind si los tipos difieren", () => {
    const arr = arrasInput();
    const senal: ContractTemplateInput = {
      kind: "senal_compra",
      templateVersion: "v1",
      payload: {} as never,
    };
    expect(diffContractTemplatePayload(arr, senal)).toEqual([
      { path: "kind", before: "arras", after: "senal_compra" },
    ]);
  });

  it("vacío si payloads iguales", () => {
    const a = arrasInput();
    expect(diffContractTemplatePayload(a, arrasInput())).toEqual([]);
  });
});
