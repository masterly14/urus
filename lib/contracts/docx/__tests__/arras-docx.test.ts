import { describe, expect, it } from "vitest";
import type { ArrasContractPayload, ContractTemplateInput } from "@/types/contracts";
import { buildArrasRenderModel } from "../builders/arras";
import { generateContractDocx } from "../index";

type ArrasInput = Extract<ContractTemplateInput, { kind: "arras" }>;

function buildArrasInput(overrides?: Partial<ArrasContractPayload>): ArrasInput {
  const basePayload: ArrasContractPayload = {
    documentDateIso: "2026-05-21",
    signPlace: "Cordoba",
    buyers: [
      {
        fullName: "Ana Lopez",
        nationalId: "12345678A",
        fiscalAddress: {
          streetLine: "Calle Sol 1",
          municipality: "Cordoba",
        },
      },
    ],
    sellers: [
      {
        fullName: "Jose Perez",
        nationalId: "98765432B",
        fiscalAddress: {
          streetLine: "Avenida Luna 2",
          municipality: "Cordoba",
        },
      },
    ],
    property: {
      addressLine: "Calle Test 33",
      municipality: "Cordoba",
      cadastralReference: "1234567UH1233S0001AB",
      urbanDescriptionLine: "URBANA: vivienda",
      registryOfficeName: "Registro de Cordoba",
      registryOfficeNumber: "2",
      fincaNumber: "987",
      cru: "CRU12345",
    },
    totalPurchasePrice: { amount: 280000, literalEs: "doscientos ochenta mil euros" },
    arrasAmount: { amount: 28000, literalEs: "veintiocho mil euros" },
    remainderAtPublicDeed: { amount: 252000, literalEs: "doscientos cincuenta y dos mil euros" },
    arrasPaymentAccount: {
      iban: "ES1121000418450200051332",
      bankName: "CaixaBank",
      holdersLine: "Jose Perez",
    },
    timelines: {
      maxDeedDateIso: "2026-08-21",
      maxKeysHandoverDateIso: "2026-08-21",
      convocatoriaNotaryMinNaturalDays: 7,
    },
    jurisdiction: {
      courtsMunicipality: "Cordoba",
    },
    flags: {
      arrasRegime: "penitencial",
      keysHandover: "same_day_as_deed",
      validitySubjectToSellerReceipt: true,
    },
  };

  return {
    kind: "arras",
    templateVersion: "2025.03.m8-v1",
    payload: {
      ...basePayload,
      ...overrides,
      flags: {
        ...basePayload.flags,
        ...(overrides?.flags ?? {}),
      },
    },
  };
}

describe("contracts/docx arras generator", () => {
  it("genera un DOCX valido y no vacio", async () => {
    const result = await generateContractDocx(buildArrasInput());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Se esperaba resultado OK");
    }

    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(result.buffer.length).toBeGreaterThan(1000);
    expect(result.buffer.subarray(0, 2).toString()).toBe("PK");
    expect(result.fileName).toContain("Contrato_Arras");
  });

  it("renderiza clausula penitencial o confirmatoria segun flags.arrasRegime", () => {
    const penitencialModel = buildArrasRenderModel(buildArrasInput().payload);
    const confirmatoriaModel = buildArrasRenderModel(
      buildArrasInput({
        flags: {
          arrasRegime: "confirmatoria",
          keysHandover: "same_day_as_deed",
          validitySubjectToSellerReceipt: true,
        },
      }).payload,
    );

    expect(penitencialModel.title).toContain("PENITENCIALES");
    expect(confirmatoriaModel.title).toContain("CONFIRMATORIAS");
    expect(
      penitencialModel.paragraphs.some((line) => line.includes("articulo 1454 del Codigo Civil")),
    ).toBe(true);
    expect(
      confirmatoriaModel.paragraphs.some((line) => line.includes("arras confirmatorias")),
    ).toBe(true);
  });

  it("cambia la clausula de entrega de llaves segun keysHandover", () => {
    const sameDay = buildArrasRenderModel(buildArrasInput().payload);
    const separateDate = buildArrasRenderModel(
      buildArrasInput({
        flags: {
          arrasRegime: "penitencial",
          keysHandover: "separate_agreed_date",
          validitySubjectToSellerReceipt: true,
        },
        timelines: {
          maxDeedDateIso: "2026-08-21",
          maxKeysHandoverDateIso: "2026-09-10",
          convocatoriaNotaryMinNaturalDays: 7,
        },
      }).payload,
    );

    expect(sameDay.paragraphs.some((line) => line.includes("mismo dia de la firma"))).toBe(true);
    expect(
      separateDate.paragraphs.some((line) =>
        line.includes("fecha separada pactada entre las partes"),
      ),
    ).toBe(true);
  });

  it("incluye o excluye la validez supeditada al cobro segun flag", () => {
    const withReceiptCondition = buildArrasRenderModel(buildArrasInput().payload);
    const withoutReceiptCondition = buildArrasRenderModel(
      buildArrasInput({
        flags: {
          arrasRegime: "penitencial",
          keysHandover: "same_day_as_deed",
          validitySubjectToSellerReceipt: false,
        },
      }).payload,
    );

    expect(
      withReceiptCondition.paragraphs.some((line) =>
        line.includes("supeditada al efectivo cobro"),
      ),
    ).toBe(true);
    expect(
      withoutReceiptCondition.paragraphs.some((line) =>
        line.includes("no queda supeditada al efectivo cobro"),
      ),
    ).toBe(true);
  });

  it("devuelve issues si faltan campos obligatorios", async () => {
    const result = await generateContractDocx(
      buildArrasInput({
        arrasPaymentAccount: {
          iban: "",
          bankName: "CaixaBank",
          holdersLine: "Jose Perez",
        },
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Se esperaba resultado con errores");
    }
    expect(result.issues.some((issue) => issue.fieldPath === "arrasPaymentAccount.iban")).toBe(
      true,
    );
  });
});
