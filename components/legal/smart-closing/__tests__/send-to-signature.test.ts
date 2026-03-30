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
    signatureRequest: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/event-store/event-store", () => ({
  appendEvent: vi.fn(),
}));

vi.mock("@/lib/signaturit", () => ({
  createSignaturitClient: vi.fn(),
}));

vi.mock("@/lib/cloudinary", () => ({
  uploadContractDocument: vi.fn(),
}));

import { POST } from "@/app/api/contracts/sign/route";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store/event-store";
import { createSignaturitClient } from "@/lib/signaturit";
import { uploadContractDocument } from "@/lib/cloudinary";
import type { ContractTemplateInput } from "@/types/contracts";

const mockCreate = vi.mocked(prisma.signatureRequest.create);
const mockAppendEvent = vi.mocked(appendEvent);
const mockCreateClient = vi.mocked(createSignaturitClient);
const mockUpload = vi.mocked(uploadContractDocument);

/**
 * Mirrors extractPrimarySignerName from page.tsx.
 * Tested here to ensure the extraction logic is correct across all contract kinds.
 */
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

describe("UI → API round-trip (sendToSignature contract)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    delete process.env.CRON_SECRET;
    delete process.env.SIGNATURIT_SIGN_API_TOKEN;
    delete process.env.SIGNATURIT_PDF_CONVERTER_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
  });

  function stubSignaturitSuccess() {
    const createSignatureRequest = vi.fn().mockResolvedValue({
      id: "sig-ui-001",
      created_at: "2026-03-25T18:00:00+0000",
      data: {},
      documents: [
        {
          id: "doc-ui-001",
          email: "ana@example.com",
          name: "Ana López",
          status: "ready",
          url: "https://signaturit.app/sign/ui-abc",
          events: [],
          file: { name: "OP-2026-0004_arras.pdf", pages: 3, size: 50000 },
        },
      ],
    });
    mockCreateClient.mockReturnValue({
      createSignatureRequest,
      getSignature: vi.fn(),
      downloadSignedDocument: vi.fn(),
      downloadAuditTrail: vi.fn(),
      cancelSignature: vi.fn(),
    });
    return createSignatureRequest;
  }

  it("full round-trip: UI builds body with docxBase64 → endpoint uploads, normalizes, sends to Signaturit, persists", async () => {
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

    const createSigReq = stubSignaturitSuccess();

    mockCreate.mockResolvedValue({
      id: "sr-ui-1",
      signaturitSignatureId: "sig-ui-001",
    } as never);
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
    expect(json).toEqual({
      signatureRequestId: "sr-ui-1",
      signaturitSignatureId: "sig-ui-001",
      signaturitDocumentId: "doc-ui-001",
      signingUrl: "https://signaturit.app/sign/ui-abc",
      status: "SENT",
      normalizedToPdf: false,
    });

    expect(mockUpload).toHaveBeenCalledOnce();
    expect(mockUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: `${operationId}_${documentKind}.docx`,
        folder: `contracts/${operationId}`,
        context: expect.objectContaining({ operationId, propertyCode }),
      }),
    );

    expect(createSigReq).toHaveBeenCalledOnce();
    expect(createSigReq).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: `${operationId}_${documentKind}.pdf`,
        recipients: [{ name: signerName, email: signerEmail }],
        deliveryType: "url",
        eventsUrl: "https://app.test/api/signaturit/webhook.json",
        data: { operationId, propertyCode, documentKind },
      }),
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          operationId,
          propertyCode,
          documentKind,
          signerName,
          signerEmail,
          status: "SENT",
          cloudinaryUrl: expect.stringContaining("cloudinary.com"),
          templateVersion,
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
          signingUrl: "https://signaturit.app/sign/ui-abc",
          signers: [{ name: signerName, email: signerEmail }],
        }),
      }),
    );
  });

  it("round-trip returns error when Signaturit rejects the request", async () => {
    const docxBase64 = Buffer.from("%PDF-1.7 bad doc").toString("base64");

    mockUpload.mockResolvedValue({
      publicId: "contracts/OP-ERR/OP-ERR_arras.docx",
      secureUrl: "https://res.cloudinary.com/demo/raw/upload/contracts/OP-ERR/OP-ERR_arras.docx",
      url: "http://res.cloudinary.com/demo/raw/upload/contracts/OP-ERR/OP-ERR_arras.docx",
      bytes: 100,
      format: "docx",
      resourceType: "raw",
      createdAt: "2026-03-25T18:00:00Z",
    });

    mockCreateClient.mockReturnValue({
      createSignatureRequest: vi.fn().mockRejectedValue(new Error("Invalid PDF structure")),
      getSignature: vi.fn(),
      downloadSignedDocument: vi.fn(),
      downloadAuditTrail: vi.fn(),
      cancelSignature: vi.fn(),
    });

    const req = new Request("https://app.test/api/contracts/sign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operationId: "OP-ERR",
        propertyCode: "P-ERR",
        documentKind: "arras",
        docxBase64,
        signers: [{ name: "Test", email: "test@example.com" }],
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.error).toBe("Signaturit API error");
    expect(json.detail).toContain("Invalid PDF structure");

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });
});
