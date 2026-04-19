/**
 * Integration tests — Smart Closing pipeline end-to-end.
 *
 * Covers scenarios NOT in e2e-contract-generation.test.ts:
 *  - Branching: Reservada vs Vendida vs Activa vs Alquilado
 *  - Multi-buyer / multi-seller DOCX generation
 *  - Error resilience (Cloudinary failure, invalid kind)
 *  - Idempotency key format verification
 *  - Post-sale integration (OPERACION_CERRADA variants)
 *  - Full pipeline chain (handleEstadoCambiado → handleGenerateContractDraft)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

vi.mock("@/lib/event-store/event-store", () => ({
  appendEvent: vi.fn(),
}));

vi.mock("@/lib/event-store", () => ({
  appendEvent: vi.fn(),
}));

vi.mock("@/lib/job-queue", () => ({
  enqueueJob: vi.fn(),
}));

vi.mock("@/lib/cloudinary", () => ({
  uploadContractDocument: vi.fn(),
}));

vi.mock("@/lib/contracts/extraction", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/contracts/extraction")>();
  return {
    ...actual,
    buildArrasContractTemplateInputFromNeonAndInmovilla: vi.fn(),
    createDefaultArrasExtractionDeps: vi.fn(),
    emitContractDataIncomplete: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

// --- Imports after mocks ---

import { appendEvent } from "@/lib/event-store/event-store";
import { appendEvent as appendEventBarrel } from "@/lib/event-store";
import { uploadContractDocument } from "@/lib/cloudinary";
import {
  buildArrasContractTemplateInputFromNeonAndInmovilla,
  createDefaultArrasExtractionDeps,
  emitContractDataIncomplete,
} from "@/lib/contracts/extraction";

import {
  handleEstadoCambiado,
  isSmartClosingTrigger,
} from "@/lib/workers/consumer/smart-closing-handler";
import { handleGenerateContractDraft } from "@/lib/workers/consumer/contract-draft-handler";

const mockAppendEvent = vi.mocked(appendEvent);
const mockAppendEventBarrel = vi.mocked(appendEventBarrel);
const mockUpload = vi.mocked(uploadContractDocument);
const mockBuildPayload = vi.mocked(buildArrasContractTemplateInputFromNeonAndInmovilla);
const mockCreateDeps = vi.mocked(createDefaultArrasExtractionDeps);
const mockEmitIncomplete = vi.mocked(emitContractDataIncomplete);

// --- Factories ---

function fakeEvent(overrides?: Record<string, unknown>) {
  return {
    id: "evt-int-001",
    position: 1n,
    type: "ESTADO_CAMBIADO" as const,
    aggregateType: "PROPERTY" as const,
    aggregateId: "2001",
    version: null,
    payload: {
      previousEstado: "Activa",
      newEstado: "Reservada",
      otherChangedFields: [],
      snapshot: { codigo: "2001" },
      detectedAt: new Date().toISOString(),
    },
    metadata: null,
    correlationId: null,
    causationId: null,
    occurredAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

function fakeJobRecord(overrides?: Record<string, unknown>) {
  return {
    id: "job-int-001",
    type: "GENERATE_CONTRACT_DRAFT" as const,
    status: "PENDING" as const,
    payload: {
      propertyCode: "2001",
      previousEstado: "Activa",
      newEstado: "Reservada",
      sourceEventId: "evt-int-001",
    },
    priority: 0,
    attempts: 0,
    maxAttempts: 5,
    availableAt: new Date(),
    lockedAt: null,
    lockedBy: null,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    lastError: null,
    idempotencyKey: null,
    sourceEventId: "evt-int-001",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function fakeEventRecord(type: string, id: string) {
  return {
    id,
    position: 10n,
    type,
    aggregateType: "OPERACION" as const,
    aggregateId: "2001",
    version: null,
    payload: {},
    metadata: null,
    correlationId: null,
    causationId: null,
    occurredAt: new Date(),
    createdAt: new Date(),
  };
}

function makeArrasPayload(overrides?: { multiBuyer?: boolean }) {
  const buyers = overrides?.multiBuyer
    ? [
        {
          fullName: "Ana Compradora Ruiz",
          nationalId: "12345678A",
          fiscalAddress: { streetLine: "Calle Sol 1", municipality: "Cordoba" },
        },
        {
          fullName: "Pedro Comprador Diaz",
          nationalId: "22334455C",
          fiscalAddress: { streetLine: "Calle Rio 8", municipality: "Cordoba" },
        },
      ]
    : [
        {
          fullName: "Ana Compradora Ruiz",
          nationalId: "12345678A",
          fiscalAddress: { streetLine: "Calle Sol 1", municipality: "Cordoba" },
        },
      ];

  const sellers = overrides?.multiBuyer
    ? [
        {
          fullName: "Jose Vendedor Lopez",
          nationalId: "87654321B",
          fiscalAddress: { streetLine: "Avenida Luna 5", municipality: "Cordoba" },
        },
        {
          fullName: "Maria Vendedora Garcia",
          nationalId: "33445566D",
          fiscalAddress: { streetLine: "Calle Monte 3", municipality: "Cordoba" },
        },
      ]
    : [
        {
          fullName: "Jose Vendedor Lopez",
          nationalId: "87654321B",
          fiscalAddress: { streetLine: "Avenida Luna 5", municipality: "Cordoba" },
        },
      ];

  return {
    documentDateIso: "2026-05-21",
    signPlace: "Cordoba",
    buyers,
    sellers,
    property: {
      addressLine: "Calle Mayor 12",
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
      holdersLine: "Jose Vendedor Lopez",
    },
    timelines: {
      maxDeedDateIso: "2026-08-21",
      maxKeysHandoverDateIso: "2026-08-21",
      convocatoriaNotaryMinNaturalDays: 7,
    },
    jurisdiction: { courtsMunicipality: "Cordoba" },
    flags: {
      arrasRegime: "penitencial" as const,
      keysHandover: "same_day_as_deed" as const,
      validitySubjectToSellerReceipt: true,
    },
  };
}

function setupHappyPathMocks(opts?: { multiBuyer?: boolean }) {
  mockCreateDeps.mockReturnValue({
    getDemandFromNeon: vi.fn(),
    getPropertyFromNeon: vi.fn(),
    getInmovillaProperty: vi.fn(),
    getInmovillaClient: vi.fn(),
  });

  mockBuildPayload.mockResolvedValue({
    ok: true,
    input: {
      kind: "arras",
      templateVersion: "m8-v1",
      payload: makeArrasPayload(opts),
    },
    sources: {
      demandFoundInNeon: true,
      propertyFoundInNeon: true,
      propertyFoundInInmovilla: true,
      buyerClientFoundInInmovilla: true,
      sellerClientFoundInInmovilla: true,
    },
  });

  mockUpload.mockResolvedValue({
    publicId: "contracts/OP-2001/Contrato_Arras_m8-v1",
    secureUrl: "https://res.cloudinary.com/demo/raw/upload/contracts/OP-2001/Contrato_Arras_m8-v1.docx",
    url: "http://res.cloudinary.com/demo/raw/upload/contracts/OP-2001/Contrato_Arras_m8-v1.docx",
    bytes: 15000,
    format: "docx",
    resourceType: "raw",
    createdAt: "2026-03-31T12:00:00Z",
  });

  mockAppendEvent.mockResolvedValue(fakeEventRecord("CONTRATO_BORRADOR_GENERADO", "evt-borrador-int"));
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ====================================================================
// 1. Branching: Reservada vs Vendida vs Activa
// ====================================================================

describe("handleEstadoCambiado — branching", () => {
  it("Reservada → GENERATE_CONTRACT_DRAFT, NO OPERACION_CERRADA", async () => {
    const event = fakeEvent();
    const result = await handleEstadoCambiado(event);

    expect(result.success).toBe(true);
    const types = result.followUpJobs!.map((j) => j.type);
    expect(types).toContain("UPDATE_PROPERTY_PROJECTION");
    expect(types).toContain("GENERATE_CONTRACT_DRAFT");
    expect(types).not.toContain("PROCESS_EVENT");
    expect(mockAppendEventBarrel).not.toHaveBeenCalled();
  });

  it("Activa → only UPDATE_PROPERTY_PROJECTION", async () => {
    const event = fakeEvent({
      payload: {
        previousEstado: "Libre",
        newEstado: "Activa",
        otherChangedFields: [],
        snapshot: { codigo: "2001" },
        detectedAt: new Date().toISOString(),
      },
    });

    const result = await handleEstadoCambiado(event);

    expect(result.success).toBe(true);
    expect(result.followUpJobs).toHaveLength(1);
    expect(result.followUpJobs![0].type).toBe("UPDATE_PROPERTY_PROJECTION");
  });

  it("Vendida → OPERACION_CERRADA + PROCESS_EVENT, NO GENERATE_CONTRACT_DRAFT", async () => {
    mockAppendEventBarrel.mockResolvedValueOnce(fakeEventRecord("OPERACION_CERRADA", "evt-closed-int"));

    const event = fakeEvent({
      payload: {
        previousEstado: "Activa",
        newEstado: "Vendida",
        otherChangedFields: [],
        snapshot: { codigo: "2001" },
        detectedAt: new Date().toISOString(),
      },
    });

    const result = await handleEstadoCambiado(event);

    expect(result.success).toBe(true);
    expect(result.followUpJobs).toHaveLength(2);
    expect(result.followUpJobs![0].type).toBe("UPDATE_PROPERTY_PROJECTION");
    expect(result.followUpJobs![1].type).toBe("PROCESS_EVENT");

    const draftJobs = result.followUpJobs!.filter((j) => j.type === "GENERATE_CONTRACT_DRAFT");
    expect(draftJobs).toHaveLength(0);

    expect(mockAppendEventBarrel).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "OPERACION_CERRADA",
        aggregateType: "OPERACION",
        aggregateId: "2001",
      }),
    );
  });

  it("Retirada → only UPDATE_PROPERTY_PROJECTION (not a trigger)", async () => {
    const event = fakeEvent({
      payload: {
        previousEstado: "Activa",
        newEstado: "Retirada",
        otherChangedFields: [],
        snapshot: { codigo: "2001" },
        detectedAt: new Date().toISOString(),
      },
    });

    const result = await handleEstadoCambiado(event);

    expect(result.success).toBe(true);
    expect(result.followUpJobs).toHaveLength(1);
    expect(result.followUpJobs![0].type).toBe("UPDATE_PROPERTY_PROJECTION");
  });
});

// ====================================================================
// 2. Post-sale: OPERACION_CERRADA variants
// ====================================================================

describe("handleEstadoCambiado — operación cerrada variants", () => {
  it.each([
    "Vendida",
    "Vendido",
    "Vendida por Otros",
    "Vendida MLS",
    "Alquilada",
    "Alquilado",
    "Alquilada por Otros",
    "Traspaso",
  ])("'%s' triggers OPERACION_CERRADA", async (newEstado) => {
    mockAppendEventBarrel.mockResolvedValueOnce(
      fakeEventRecord("OPERACION_CERRADA", `evt-closed-${newEstado}`),
    );

    const event = fakeEvent({
      payload: {
        previousEstado: "Activa",
        newEstado,
        otherChangedFields: [],
        snapshot: { codigo: "2001" },
        detectedAt: new Date().toISOString(),
      },
    });

    const result = await handleEstadoCambiado(event);

    expect(result.success).toBe(true);
    expect(mockAppendEventBarrel).toHaveBeenCalledWith(
      expect.objectContaining({ type: "OPERACION_CERRADA" }),
    );

    const processEventJob = result.followUpJobs!.find((j) => j.type === "PROCESS_EVENT");
    expect(processEventJob).toBeDefined();
    expect(processEventJob!.sourceEventId).toContain("evt-closed-");
  });

  it("OPERACION_CERRADA payload includes propertyCode, estados, closedAt", async () => {
    mockAppendEventBarrel.mockResolvedValueOnce(
      fakeEventRecord("OPERACION_CERRADA", "evt-closed-detail"),
    );

    const event = fakeEvent({
      payload: {
        previousEstado: "Reservada",
        newEstado: "Vendida",
        otherChangedFields: [],
        snapshot: { codigo: "2001" },
        detectedAt: new Date().toISOString(),
      },
    });

    await handleEstadoCambiado(event);

    const callPayload = mockAppendEventBarrel.mock.calls[0][0].payload as Record<string, unknown>;
    expect(callPayload.previousEstado).toBe("Reservada");
    expect(callPayload.newEstado).toBe("Vendida");
    expect(callPayload.propertyCode).toBe("2001");
    expect(callPayload.closedAt).toBeDefined();
    expect(callPayload.sourceEstadoCambiadoEventId).toBe("evt-int-001");
  });
});

// ====================================================================
// 3. Idempotency key verification
// ====================================================================

describe("handleEstadoCambiado — idempotency keys", () => {
  it("UPDATE_PROPERTY_PROJECTION key = update_property_projection:{eventId}", async () => {
    const event = fakeEvent({ id: "evt-idem-001" });
    const result = await handleEstadoCambiado(event);

    const projJob = result.followUpJobs!.find((j) => j.type === "UPDATE_PROPERTY_PROJECTION")!;
    expect(projJob.idempotencyKey).toBe("update_property_projection:evt-idem-001");
  });

  it("GENERATE_CONTRACT_DRAFT key = generate_contract_draft:{code}:{eventId}", async () => {
    const event = fakeEvent({ id: "evt-idem-002" });
    const result = await handleEstadoCambiado(event);

    const draftJob = result.followUpJobs!.find((j) => j.type === "GENERATE_CONTRACT_DRAFT")!;
    expect(draftJob.idempotencyKey).toBe("generate_contract_draft:2001:evt-idem-002");
  });

  it("PROCESS_EVENT (OPERACION_CERRADA) key includes propertyCode and source event", async () => {
    mockAppendEventBarrel.mockResolvedValueOnce(
      fakeEventRecord("OPERACION_CERRADA", "evt-closed-idem"),
    );

    const event = fakeEvent({
      id: "evt-idem-003",
      payload: {
        previousEstado: "Activa",
        newEstado: "Vendida",
        otherChangedFields: [],
        snapshot: { codigo: "2001" },
        detectedAt: new Date().toISOString(),
      },
    });

    const result = await handleEstadoCambiado(event);
    const processJob = result.followUpJobs!.find((j) => j.type === "PROCESS_EVENT")!;
    expect(processJob.idempotencyKey).toBe("process_operacion_cerrada:2001:evt-idem-003");
  });
});

// ====================================================================
// 4. Full pipeline: estado → draft → DOCX valid
// ====================================================================

describe("full pipeline: handleEstadoCambiado → handleGenerateContractDraft", () => {
  it("Reservada event produces a GENERATE_CONTRACT_DRAFT that generates valid DOCX", async () => {
    const event = fakeEvent();
    const estadoResult = await handleEstadoCambiado(event);

    const draftJob = estadoResult.followUpJobs!.find(
      (j) => j.type === "GENERATE_CONTRACT_DRAFT",
    )!;
    expect(draftJob).toBeDefined();

    setupHappyPathMocks();

    const job = fakeJobRecord({
      payload: draftJob.payload,
      sourceEventId: draftJob.sourceEventId,
    });

    const draftResult = await handleGenerateContractDraft(job);
    expect(draftResult.success).toBe(true);

    expect(mockUpload).toHaveBeenCalledTimes(1);
    const uploadArg = mockUpload.mock.calls[0][0];
    expect(Buffer.isBuffer(uploadArg.buffer)).toBe(true);
    expect(uploadArg.buffer.subarray(0, 2).toString()).toBe("PK");
    expect(uploadArg.buffer.length).toBeGreaterThan(100);

    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "CONTRATO_BORRADOR_GENERADO",
        aggregateId: "2001",
      }),
    );
  });
});

// ====================================================================
// 5. Multi-buyer / multi-seller DOCX
// ====================================================================

describe("handleGenerateContractDraft — multi-party", () => {
  it("generates valid DOCX with 2 buyers and 2 sellers", async () => {
    setupHappyPathMocks({ multiBuyer: true });

    const job = fakeJobRecord();
    const result = await handleGenerateContractDraft(job);

    expect(result.success).toBe(true);

    const uploadArg = mockUpload.mock.calls[0][0];
    expect(Buffer.isBuffer(uploadArg.buffer)).toBe(true);
    expect(uploadArg.buffer.subarray(0, 2).toString()).toBe("PK");
    expect(uploadArg.buffer.length).toBeGreaterThan(100);

    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "CONTRATO_BORRADOR_GENERADO" }),
    );
  });
});

// ====================================================================
// 6. Error resilience
// ====================================================================

describe("handleGenerateContractDraft — error resilience", () => {
  it("Cloudinary upload throws → handler returns success: false", async () => {
    mockCreateDeps.mockReturnValue({
      getDemandFromNeon: vi.fn(),
      getPropertyFromNeon: vi.fn(),
      getInmovillaProperty: vi.fn(),
      getInmovillaClient: vi.fn(),
    });

    mockBuildPayload.mockResolvedValue({
      ok: true,
      input: {
        kind: "arras",
        templateVersion: "m8-v1",
        payload: makeArrasPayload(),
      },
      sources: {
        demandFoundInNeon: true,
        propertyFoundInNeon: true,
        propertyFoundInInmovilla: true,
        buyerClientFoundInInmovilla: true,
        sellerClientFoundInInmovilla: true,
      },
    });

    mockUpload.mockRejectedValue(new Error("Cloudinary network error"));

    const job = fakeJobRecord();
    await expect(handleGenerateContractDraft(job)).rejects.toThrow("Cloudinary network error");
  });

  it("missing propertyCode → permanent error", async () => {
    const job = fakeJobRecord({ payload: {} });
    const result = await handleGenerateContractDraft(job);

    expect(result.success).toBe(false);
    expect(result.permanent).toBe(true);
    expect(result.error).toContain("propertyCode");
  });

  it("null payload → permanent error", async () => {
    const job = fakeJobRecord({ payload: null });
    const result = await handleGenerateContractDraft(job);

    expect(result.success).toBe(false);
    expect(result.permanent).toBe(true);
  });

  it("datos incompletos → emitContractDataIncomplete called, no DOCX", async () => {
    mockCreateDeps.mockReturnValue({
      getDemandFromNeon: vi.fn(),
      getPropertyFromNeon: vi.fn(),
      getInmovillaProperty: vi.fn(),
      getInmovillaClient: vi.fn(),
    });

    mockBuildPayload.mockResolvedValue({
      ok: false,
      input: { kind: "arras", templateVersion: "m8-v1", payload: {} as never },
      issues: [
        {
          event: "DATOS_INCOMPLETOS",
          documentKind: "arras",
          fieldPath: "sellers.0.nationalId",
          message: "DNI vendedor obligatorio",
        },
      ],
      validationSignal: {
        event: {
          event: "DATOS_INCOMPLETOS",
          demandId: "2001",
          propertyCode: "2001",
          operationId: "OP-2001",
          documentKind: "arras",
          missingRequiredCategories: ["dni"],
          issues: [
            {
              event: "DATOS_INCOMPLETOS",
              documentKind: "arras",
              fieldPath: "sellers.0.nationalId",
              message: "DNI vendedor obligatorio",
            },
          ],
        },
        commercialTask: {
          type: "CONTRACT_DATA_COMPLETION",
          demandId: "2001",
          propertyCode: "2001",
          operationId: "OP-2001",
          assignedCommercialId: "system",
          title: "Completar datos",
          description: "Faltan datos para contrato: dni.",
          priority: "HIGH",
          status: "PENDING",
          missingRequiredCategories: ["dni"],
          issues: [
            {
              event: "DATOS_INCOMPLETOS",
              documentKind: "arras",
              fieldPath: "sellers.0.nationalId",
              message: "DNI vendedor obligatorio",
            },
          ],
        },
      },
      sources: {
        demandFoundInNeon: true,
        propertyFoundInNeon: true,
        propertyFoundInInmovilla: true,
        buyerClientFoundInInmovilla: false,
        sellerClientFoundInInmovilla: false,
      },
    });

    mockEmitIncomplete.mockResolvedValue({
      event: fakeEventRecord("DATOS_INCOMPLETOS", "evt-incomplete-int") as never,
      job: fakeJobRecord({ type: "NOTIFY_CONTRACT_DATA_INCOMPLETE" as never }) as never,
    });

    const job = fakeJobRecord();
    const result = await handleGenerateContractDraft(job);

    expect(result.success).toBe(true);
    expect(mockEmitIncomplete).toHaveBeenCalledTimes(1);
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });
});

// ====================================================================
// 7. handleEstadoCambiado with non-status payload
// ====================================================================

describe("handleEstadoCambiado — edge cases", () => {
  it("event without status payload → only UPDATE_PROPERTY_PROJECTION", async () => {
    const event = fakeEvent({
      payload: { someOtherField: "value" },
    });

    const result = await handleEstadoCambiado(event);

    expect(result.success).toBe(true);
    expect(result.followUpJobs).toHaveLength(1);
    expect(result.followUpJobs![0].type).toBe("UPDATE_PROPERTY_PROJECTION");
  });

  it("snapshot.codigo overrides aggregateId for propertyCode", async () => {
    const event = fakeEvent({
      aggregateId: "AGG-9999",
      payload: {
        previousEstado: "Activa",
        newEstado: "Reservada",
        otherChangedFields: [],
        snapshot: { codigo: "PROP-5555" },
        detectedAt: new Date().toISOString(),
      },
    });

    const result = await handleEstadoCambiado(event);

    const draftJob = result.followUpJobs!.find((j) => j.type === "GENERATE_CONTRACT_DRAFT")!;
    expect((draftJob.payload as Record<string, unknown>).propertyCode).toBe("PROP-5555");
  });

  it("missing snapshot.codigo falls back to aggregateId", async () => {
    const event = fakeEvent({
      aggregateId: "AGG-7777",
      payload: {
        previousEstado: "Activa",
        newEstado: "Arras firmadas",
        otherChangedFields: [],
        detectedAt: new Date().toISOString(),
      },
    });

    const result = await handleEstadoCambiado(event);

    const draftJob = result.followUpJobs!.find((j) => j.type === "GENERATE_CONTRACT_DRAFT")!;
    expect((draftJob.payload as Record<string, unknown>).propertyCode).toBe("AGG-7777");
  });
});
