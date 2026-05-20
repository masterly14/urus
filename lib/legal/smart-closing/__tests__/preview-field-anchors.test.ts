import { describe, expect, it } from "vitest";
import { buildPreviewFieldAnchors } from "../preview-field-anchors";

describe("buildPreviewFieldAnchors", () => {
  it("construye anchors editables para arras con partes, fechas e importes formateados", () => {
    const anchors = buildPreviewFieldAnchors({
      kind: "arras",
      payload: {
        documentDateIso: "2026-05-19",
        signPlace: "Cordoba",
        buyers: [
          {
            fullName: "Maria Garcia Lopez",
            nationalId: "12345678Z",
            fiscalAddress: { streetLine: "Calle Gran Via 15", municipality: "Cordoba" },
          },
        ],
        property: {
          addressLine: "Calle de la Plata 8",
          municipality: "Cordoba",
          cadastralReference: "REF-1",
        },
        totalPurchasePrice: { amount: 245000, literalEs: "doscientos cuarenta y cinco mil euros" },
        arrasAmount: { amount: 24500, literalEs: "veinticuatro mil quinientos euros" },
        remainderAtPublicDeed: { amount: 220500, literalEs: "doscientos veinte mil quinientos euros" },
      },
    });

    expect(anchors.some((a) => a.path === "buyers[0].fullName")).toBe(true);
    expect(anchors.some((a) => a.path === "property.addressLine")).toBe(true);
    expect(anchors.some((a) => a.path === "documentDateIso" && a.value === "19 de mayo de 2026")).toBe(true);
    expect(anchors.some((a) => a.path === "arrasAmount.amount" && a.value === "24.500,00 EUR")).toBe(true);
    expect(anchors.some((a) => a.path === "remainderAtPublicDeed.literalEs" && a.value === "doscientos veinte mil quinientos euros")).toBe(true);

    const buyerName = anchors.find((a) => a.path === "buyers[0].fullName");
    expect(buyerName?.label).toBe("Nombre del comprador");
    expect(buyerName?.value).toBe("Maria Garcia Lopez");
  });

  it("construye anchors para señal de compra con comprador, señal, precio y plazos", () => {
    const anchors = buildPreviewFieldAnchors({
      kind: "senal_compra",
      payload: {
        documentDateIso: "2026-06-01",
        signPlace: "Madrid",
        agency: {
          companyLegalName: "Urus Capital Group SL",
          companyTaxId: "B12345678",
          companyMunicipality: "Madrid",
          representative: {
            fullName: "Laura Gomez",
            nationalId: "11111111A",
            fiscalAddress: { streetLine: "Calle Agencia 1", municipality: "Madrid" },
          },
          depositBankAccount: { iban: "ES120000", bankName: "Banco", holdersLine: "Urus" },
        },
        purchaser: {
          fullName: "Comprador Senal",
          nationalId: "22222222B",
          fiscalAddress: { streetLine: "Calle Comprador 2", municipality: "Madrid" },
        },
        property: {
          addressLine: "Calle Señal 10",
          municipality: "Madrid",
          cadastralReference: "SENAL-REF",
        },
        senalAmount: { amount: 10000, literalEs: "diez mil euros" },
        offeredPrice: { amount: 240000, literalEs: "doscientos cuarenta mil euros" },
        timelines: {
          businessDaysToArrasContract: 10,
          maxNaturalDaysToEscrituraFromSenalSignature: 60,
          convocatoriaNotaryMinNaturalDays: 7,
        },
        fees: { model: "fixed_net", netAmount: { amount: 5000, literalEs: "cinco mil euros" }, vatRatePercent: 21, devengo: "firma_arras" },
        jurisdiction: { courtsMunicipality: "Madrid" },
        flags: { includeFinancingFallbackClause: true, keysHandover: "same_day_as_deed" },
      },
    });

    expect(anchors.some((a) => a.path === "purchaser.fullName" && a.value === "Comprador Senal")).toBe(true);
    expect(anchors.some((a) => a.path === "senalAmount.amount" && a.value === "10.000,00 EUR")).toBe(true);
    expect(anchors.some((a) => a.path === "offeredPrice.literalEs" && a.value === "doscientos cuarenta mil euros")).toBe(true);
    expect(anchors.some((a) => a.path === "timelines.businessDaysToArrasContract" && a.value === "10 dias habiles")).toBe(true);
  });

  it("construye anchors para oferta firme con ofertantes e importes clave", () => {
    const anchors = buildPreviewFieldAnchors({
      kind: "oferta_firme",
      payload: {
        documentDateIso: "2026-07-01",
        signPlace: "Valencia",
        agency: {
          companyLegalName: "Urus Capital Group SL",
          companyTaxId: "B12345678",
          companyMunicipality: "Valencia",
          representative: {
            fullName: "Laura Gomez",
            nationalId: "11111111A",
            fiscalAddress: { streetLine: "Calle Agencia 1", municipality: "Valencia" },
          },
          depositBankAccount: { iban: "ES120000", bankName: "Banco", holdersLine: "Urus" },
        },
        offerers: [
          {
            fullName: "Ofertante Uno",
            nationalId: "33333333C",
            fiscalAddress: { streetLine: "Calle Oferta 3", municipality: "Valencia" },
          },
        ],
        property: {
          addressLine: "Calle Oferta 20",
          municipality: "Valencia",
          cadastralReference: "OFERTA-REF",
        },
        listingPrice: { amount: 260000, literalEs: "doscientos sesenta mil euros" },
        offeredPrice: { amount: 250000, literalEs: "doscientos cincuenta mil euros" },
        offerDeposit: { amount: 3000, literalEs: "tres mil euros" },
        arrasAmountAfterAcceptance: { amount: 25000, literalEs: "veinticinco mil euros" },
        timelines: {
          offerValidityNaturalDays: 3,
          arrasSigningMaxNaturalDaysFromAcceptance: 15,
          escrituraMaxNaturalDaysFromArrasSignature: 60,
        },
        fees: { model: "percent_of_final_price", percentOfFinalPrice: 3, vatRatePercent: 21, devengo: "firma_arras" },
        jurisdiction: { courtsMunicipality: "Valencia" },
        flags: { includePropertyAcceptanceSection: true },
      },
    });

    expect(anchors.some((a) => a.path === "offerers[0].fullName" && a.value === "Ofertante Uno")).toBe(true);
    expect(anchors.some((a) => a.path === "listingPrice.amount" && a.value === "260.000,00 EUR")).toBe(true);
    expect(anchors.some((a) => a.path === "offerDeposit.literalEs" && a.value === "tres mil euros")).toBe(true);
    expect(anchors.some((a) => a.path === "timelines.offerValidityNaturalDays" && a.value === "3 dias naturales")).toBe(true);
  });

  it("construye anchors para anexo mobiliario con operación, partes e ítems", () => {
    const anchors = buildPreviewFieldAnchors({
      kind: "anexo_mobiliario",
      payload: {
        documentDateIso: "2026-08-15",
        signPlace: "Malaga",
        operationRef: "OP-MOB-001",
        propertyAddressLine: "Calle Mobiliario 4",
        partiesLine: "Comprador Uno y Vendedor Uno",
        items: [
          {
            description: "Sofa chaise longue gris",
            quantity: 1,
            includedInPurchasePrice: true,
            estimatedValueEur: { amount: 1200, literalEs: "mil doscientos euros" },
          },
        ],
        flags: { hasFurniture: true },
      },
    });

    expect(anchors.some((a) => a.path === "operationRef" && a.label === "Referencia de operacion")).toBe(true);
    expect(anchors.some((a) => a.path === "propertyAddressLine" && a.value === "Calle Mobiliario 4")).toBe(true);
    expect(anchors.some((a) => a.path === "partiesLine" && a.value === "Comprador Uno y Vendedor Uno")).toBe(true);
    expect(anchors.some((a) => a.path === "items[0].description" && a.label === "Descripcion del mobiliario")).toBe(true);
    expect(anchors.some((a) => a.path === "items[0].estimatedValueEur.amount" && a.value === "1200,00 EUR")).toBe(true);
  });
});
