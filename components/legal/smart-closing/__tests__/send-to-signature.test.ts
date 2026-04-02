/**
 * Integration test: simulates the exact request body that the UI hook
 * (sendToSignature) sends to POST /api/contracts/sign when using docxBase64,
 * and runs it against the real route handler with mocked externals.
 *
 * This validates the full contract between the UI and the API endpoint.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    operacion: { findFirst: vi.fn().mockResolvedValue(null) },
    legalDocument: { findFirst: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
    legalDocumentParty: { upsert: vi.fn() },
    signatureRequest: { create: vi.fn() },
  },
}));

vi.mock("@/lib/event-store/event-store", () => ({
  appendEvent: vi.fn(),
}));

vi.mock("@/lib/cloudinary", () => ({
  uploadContractDocument: vi.fn(),
}));

vi.mock("@/lib/firma", () => ({
  computeSha256: vi.fn().mockReturnValue("sha256-test-hash"),
  generateSigningToken: vi.fn().mockReturnValue("testtoken.hmac"),
  buildSigningUrl: vi.fn().mockReturnValue("https://app.test/firma/testtoken.hmac"),
}));

import { POST } from "@/app/api/contracts/sign/route";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store/event-store";
import { uploadContractDocument } from "@/lib/cloudinary";
import type { ContractTemplateInput } from "@/types/contracts";

const mockCreate = vi.mocked(prisma.signatureRequest.create);
const mockAppendEvent = vi.mocked(appendEvent);
const mockUpload = vi.mocked(uploadContractDocument);

function extractPrimarySignerName(input: ContractTemplateInput): string {
  switch (input.kind) {
    case "arras":
      return input.payload.buyers[0]?.fullName ?? "";
    case "senal_compra":
      return input.payload.purchaser.fullName;
    case "oferta_firme":
      return input.payload.offerers[0]?.fullName ?? "";
    default:
      return "";
  }
}

describe("extractPrimarySignerName", () => {
  it("extracts buyer name from arras payload", () => {
    const input: ContractTemplateInput = {
      kind: "arras",
      templateVersion: "test-v1",
      payload: {
        documentDateIso: "2026-01-01",
        signPlace: "Córdoba",
        buyers: [
          {
            fullName: "Ana López",
            nationalId: "12345678A",
            fiscalAddress: { streetLine: "Calle 1", municipality: "Córdoba" },
          },
        ],
        sellers: [
          {
            fullName: "José Pérez",
            nationalId: "98765432B",
            fiscalAddress: { streetLine: "Calle 2", municipality: "Córdoba" },
          },
        ],
        property: {
          addressLine: "Test",
          municipality: "Córdoba",
          cadastralReference: "ABC",
        },
        totalPurchasePrice: { amount: 100000, literalEs: "cien mil" },
        arrasAmount: { amount: 10000, literalEs: "diez mil" },
        remainderAtPublicDeed: { amount: 90000, literalEs: "noventa mil" },
        arrasPaymentAccount: { iban: "ES00", bankName: "Test", holdersLine: "Test" },
        timelines: {
          maxDeedDateIso: "2026-06-01",
          maxKeysHandoverDateIso: "2026-06-01",
          convocatoriaNotaryMinNaturalDays: 7,
        },
        jurisdiction: { courtsMunicipality: "Córdoba" },
        flags: {
          arrasRegime: "penitencial",
          keysHandover: "same_day_as_deed",
          validitySubjectToSellerReceipt: true,
        },
      },
    };

    expect(extractPrimarySignerName(input)).toBe("Ana López");
  });

  it("extracts purchaser name from senal_compra payload", () => {
    const input = {
      kind: "senal_compra" as const,
      payload: {
        documentDateIso: "2026-01-01",
        signPlace: "Córdoba",
        agency: {
          representative: {
            fullName: "Rep",
            nationalId: "X",
            fiscalAddress: { streetLine: "X", municipality: "X" },
          },
          companyLegalName: "Co",
          companyTaxId: "B1",
          companyMunicipality: "X",
          depositBankAccount: { iban: "ES00", bankName: "B", holdersLine: "H" },
        },
        purchaser: {
          fullName: "Marta Jiménez",
          nationalId: "11111111A",
          fiscalAddress: { streetLine: "Calle 3", municipality: "Córdoba" },
        },
        property: { addressLine: "Test", municipality: "Córdoba", cadastralReference: "ABC" },
        senalAmount: { amount: 3000, literalEs: "tres mil" },
        offeredPrice: { amount: 180000, literalEs: "ciento ochenta mil" },
        timelines: {
          businessDaysToArrasContract: 15,
          maxNaturalDaysToEscrituraFromSenalSignature: 90,
          convocatoriaNotaryMinNaturalDays: 7,
        },
        fees: {
          model: "fixed_net" as const,
          netAmount: { amount: 3500, literalEs: "tres mil quinientos" },
          vatRatePercent: 21,
          devengo: "firma_arras" as const,
        },
        jurisdiction: { courtsMunicipality: "Córdoba" },
        flags: { includeFinancingFallbackClause: true, keysHandover: "same_day_as_deed" as const },
      },
    };

    expect(extractPrimarySignerName(input)).toBe("Marta Jiménez");
  });

  it("extracts offerer name from oferta_firme payload", () => {
    const input = {
      kind: "oferta_firme" as const,
      payload: {
        documentDateIso: "2026-01-01",
        signPlace: "Córdoba",
        agency: {
          representative: {
            fullName: "Rep",
            nationalId: "X",
            fiscalAddress: { streetLine: "X", municipality: "X" },
          },
          companyLegalName: "Co",
          companyTaxId: "B1",
          companyMunicipality: "X",
          depositBankAccount: { iban: "ES00", bankName: "B", holdersLine: "H" },
        },
        offerers: [
          {
            fullName: "Carlos García",
            nationalId: "33333333C",
            fiscalAddress: { streetLine: "Calle 5", municipality: "Córdoba" },
          },
        ],
        property: { addressLine: "Test", municipality: "Córdoba", cadastralReference: "ABC" },
        listingPrice: { amount: 250000, literalEs: "doscientos cincuenta mil" },
        offeredPrice: { amount: 230000, literalEs: "doscientos treinta mil" },
        offerDeposit: { amount: 5000, literalEs: "cinco mil" },
        arrasAmountAfterAcceptance: { amount: 23000, literalEs: "veintitrés mil" },
        timelines: {
          offerValidityNaturalDays: 3,
          arrasSigningMaxNaturalDaysFromAcceptance: 10,
          escrituraMaxNaturalDaysFromArrasSignature: 90,
        },
        fees: {
          model: "percent_of_final_price" as const,
          percentOfFinalPrice: 2,
          vatRatePercent: 21,
          devengo: "firma_arras" as const,
        },
        jurisdiction: { courtsMunicipality: "Córdoba" },
        flags: { includePropertyAcceptanceSection: true },
      },
    };

    expect(extractPrimarySignerName(input)).toBe("Carlos García");
  });
});

describe("UI → API round-trip (sendToSignature contract, in-house)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    delete process.env.CRON_SECRET;
    delete process.env.SIGNATURIT_SIGN_API_TOKEN;
    delete process.env.SIGNATURIT_PDF_CONVERTER_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
    process.env.FIRMA_TOKEN_SECRET = "test-secret-64chars-0000000000000000000000000000000000000000000";
  });

  it("full round-trip: UI builds body with docxBase64 → endpoint uploads, hashes, creates in-house signature", async () => {
    const docxBase64 = Buffer.from("%PDF-1.7 simulated contract").toString("base64");
    const operationId = "OP-2026-0004";
    const propertyCode = "op-4";
    const documentKind = "arras";
    const templateVersion = "2025.03.m8-v1";
    const signerName = "Ana López";
    const signerEmail = "ana@example.com";

    mockUpload.mockResolvedValue({
      publicId: `contracts/${operationId}/${operationId}_${documentKind}.docx`,
      secureUrl: `https://res.cloudinary.com/demo/raw/upload/contracts/${operationId}/${operationId}_${documentKind}.docx`,
      url: `http://res.cloudinary.com/demo/raw/upload/contracts/${operationId}/${operationId}_${documentKind}.docx`,
      bytes: 2048,
      format: "docx",
      resourceType: "raw",
      createdAt: "2026-03-25T18:00:00Z",
    });

    mockCreate.mockResolvedValue({ id: "sr-ui-1" } as never);
    vi.mocked(prisma.legalDocument.upsert).mockResolvedValue({ id: "ld-1" } as never);
    vi.mocked(prisma.legalDocumentParty.upsert).mockResolvedValue({} as never);
    mockAppendEvent.mockResolvedValue({} as never);

    const requestBody = {
      operationId,
      propertyCode,
      documentKind,
      templateVersion,
      docxBase64,
      signers: [{ name: signerName, email: signerEmail }],
    };

    const req = new Request("https://app.test/api/contracts/sign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.signingUrl).toBe("https://app.test/firma/testtoken.hmac");
    expect(json.documentHash).toBe("sha256-test-hash");
    expect(json.status).toBe("SENT");

    expect(mockUpload).toHaveBeenCalledOnce();

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          operationId,
          propertyCode,
          documentKind,
          signerName,
          signerEmail,
          status: "SENT",
          documentHash: "sha256-test-hash",
          signingToken: "testtoken.hmac",
        }),
      }),
    );

    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "FIRMA_ENVIADA",
        aggregateType: "PROPERTY",
        aggregateId: propertyCode,
        payload: expect.objectContaining({
          operationId,
          documentKind,
          documentHash: "sha256-test-hash",
          signers: [{ name: signerName, email: signerEmail }],
        }),
      }),
    );
  });
});
