import { describe, expect, it } from "vitest";
import {
  normalizeSmartClosingContractDetail,
  normalizeSmartClosingVersionEvent,
} from "../contracts-api";

describe("contracts-api helpers", () => {
  it("normaliza un LegalDocument real para hidratar Smart Closing", () => {
    const result = normalizeSmartClosingContractDetail({
      id: "ld-1",
      operationId: "OP-2026-0004",
      propertyCode: "P-4",
      documentKind: "arras",
      status: "DRAFT",
      templateVersion: "OP-2026-0004_arras_v1",
      cloudinaryUrl: "https://res.cloudinary.com/demo/raw/upload/contracts/doc.docx",
      createdAt: new Date("2026-04-01T10:00:00.000Z"),
      updatedAt: new Date("2026-04-01T11:00:00.000Z"),
      contractInput: {
        kind: "arras",
        templateVersion: "OP-2026-0004_arras_v1",
        payload: {
          documentDateIso: "2026-04-01",
          signPlace: "Cordoba",
          buyers: [
            {
              fullName: "Ana Compradora",
              nationalId: "12345678A",
              fiscalAddress: { streetLine: "Calle Sol 1", municipality: "Cordoba" },
            },
          ],
          sellers: [
            {
              fullName: "Jose Vendedor",
              nationalId: "87654321B",
              fiscalAddress: { streetLine: "Calle Luna 2", municipality: "Cordoba" },
            },
          ],
          property: {
            addressLine: "Calle Mayor 3",
            municipality: "Cordoba",
            cadastralReference: "ABC",
          },
          totalPurchasePrice: { amount: 100000, literalEs: "cien mil euros" },
          arrasAmount: { amount: 10000, literalEs: "diez mil euros" },
          remainderAtPublicDeed: { amount: 90000, literalEs: "noventa mil euros" },
          arrasPaymentAccount: {
            iban: "ES000000000000000000",
            bankName: "Banco",
            holdersLine: "Jose Vendedor",
          },
          timelines: {
            maxDeedDateIso: "2026-06-01",
            maxKeysHandoverDateIso: "2026-06-01",
            convocatoriaNotaryMinNaturalDays: 7,
          },
          jurisdiction: { courtsMunicipality: "Cordoba" },
          flags: {
            arrasRegime: "penitencial",
            keysHandover: "same_day_as_deed",
            validitySubjectToSellerReceipt: true,
          },
        },
      },
      parties: [
        { role: "BUYER", fullName: "Ana Compradora", email: "ana@test.com", phone: null },
        { role: "SELLER", fullName: "Jose Vendedor", email: null, phone: "34600000000" },
      ],
    });

    expect(result.id).toBe("ld-1");
    expect(result.contractTemplateInput.kind).toBe("arras");
    expect(result.parties).toHaveLength(2);
  });

  it("normaliza un evento CONTRATO_VERSIONADO con patch y snapshot", () => {
    const result = normalizeSmartClosingVersionEvent({
      id: "evt-1",
      occurredAt: new Date("2026-04-01T12:00:00.000Z"),
      payload: {
        nextTemplateVersion: "OP-2026-0004_arras_v2",
        appliedSummaries: ["Honorarios actualizados", "Fuero ajustado"],
        patch: {
          confidence: 0.82,
          ambiguousPoints: ["Confirmar si el plazo es natural"],
        },
        contractInput: {
          kind: "arras",
          templateVersion: "OP-2026-0004_arras_v2",
          payload: {
            documentDateIso: "2026-04-01",
            signPlace: "Cordoba",
            buyers: [
              {
                fullName: "Ana Compradora",
                nationalId: "12345678A",
                fiscalAddress: { streetLine: "Calle Sol 1", municipality: "Cordoba" },
              },
            ],
            sellers: [
              {
                fullName: "Jose Vendedor",
                nationalId: "87654321B",
                fiscalAddress: { streetLine: "Calle Luna 2", municipality: "Cordoba" },
              },
            ],
            property: {
              addressLine: "Calle Mayor 3",
              municipality: "Cordoba",
              cadastralReference: "ABC",
            },
            totalPurchasePrice: { amount: 100000, literalEs: "cien mil euros" },
            arrasAmount: { amount: 10000, literalEs: "diez mil euros" },
            remainderAtPublicDeed: { amount: 90000, literalEs: "noventa mil euros" },
            arrasPaymentAccount: {
              iban: "ES000000000000000000",
              bankName: "Banco",
              holdersLine: "Jose Vendedor",
            },
            timelines: {
              maxDeedDateIso: "2026-06-01",
              maxKeysHandoverDateIso: "2026-06-01",
              convocatoriaNotaryMinNaturalDays: 7,
            },
            jurisdiction: { courtsMunicipality: "Cordoba" },
            flags: {
              arrasRegime: "penitencial",
              keysHandover: "same_day_as_deed",
              validitySubjectToSellerReceipt: true,
            },
          },
        },
      },
    });

    expect(result?.templateVersion).toBe("OP-2026-0004_arras_v2");
    expect(result?.summary).toContain("Honorarios actualizados");
    expect(result?.confidence).toBe(0.82);
    expect(result?.contractInput?.templateVersion).toBe("OP-2026-0004_arras_v2");
  });
});
