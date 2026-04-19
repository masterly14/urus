/**
 * Test E2E del ciclo completo Smart Closing (Día 13, ítem 5):
 * ESTADO_CAMBIADO → handler detecta Reserva/Arras → GENERATE_CONTRACT_DRAFT →
 * extracción → generación DOCX → upload Cloudinary → CONTRATO_BORRADOR_GENERADO.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks de infraestructura ---

vi.mock("@/lib/event-store/event-store", () => ({
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

// --- Imports tras mocks ---
import { appendEvent } from "@/lib/event-store/event-store";
import { enqueueJob } from "@/lib/job-queue";
import { uploadContractDocument } from "@/lib/cloudinary";
import {
  buildArrasContractTemplateInputFromNeonAndInmovilla,
  createDefaultArrasExtractionDeps,
  emitContractDataIncomplete,
} from "@/lib/contracts/extraction";

import {
  handleEstadoCambiado,
  isSmartClosingTrigger,
  SMART_CLOSING_TRIGGER_KEYWORDS,
} from "@/lib/workers/consumer/smart-closing-handler";
import { handleGenerateContractDraft } from "@/lib/workers/consumer/contract-draft-handler";

const mockAppendEvent = vi.mocked(appendEvent);
const mockEnqueueJob = vi.mocked(enqueueJob);
const mockUpload = vi.mocked(uploadContractDocument);
const mockBuildPayload = vi.mocked(buildArrasContractTemplateInputFromNeonAndInmovilla);
const mockCreateDeps = vi.mocked(createDefaultArrasExtractionDeps);
const mockEmitIncomplete = vi.mocked(emitContractDataIncomplete);

function fakeEvent(overrides?: Record<string, unknown>) {
  return {
    id: "evt-e2e-001",
    position: 1n,
    type: "ESTADO_CAMBIADO" as const,
    aggregateType: "PROPERTY" as const,
    aggregateId: "1001",
    version: null,
    payload: {
      previousEstado: "Activa",
      newEstado: "Reservada",
      otherChangedFields: [],
      snapshot: { codigo: "1001" },
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
    id: "job-e2e-001",
    type: "GENERATE_CONTRACT_DRAFT" as const,
    status: "PENDING" as const,
    payload: {
      propertyCode: "1001",
      previousEstado: "Activa",
      newEstado: "Reservada",
      sourceEventId: "evt-e2e-001",
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
    sourceEventId: "evt-e2e-001",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function happyPathDeps() {
  return {
    getDemandFromNeon: vi.fn().mockResolvedValue({
      codigo: "DEM-1",
      nombre: "Ana Compradora",
      raw: { keycli: "101" },
    }),
    getPropertyFromNeon: vi.fn().mockResolvedValue({
      codigo: "1001",
      ciudad: "Cordoba",
      titulo: "Vivienda Centro",
      raw: { keycli: "202", propietario: "Jose Vendedor" },
    }),
    getInmovillaProperty: vi.fn().mockResolvedValue({
      cod_ofer: 1001,
      keycli: 202,
      calle: "Calle Mayor",
      numero: 12,
      localidad: "Cordoba",
      refcat: "1234567UH1233S0001AB",
      finca: "F-200",
    }),
    getInmovillaClient: vi.fn().mockImplementation(async (code: number) => {
      if (code === 101) {
        return {
          cod_cli: 101,
          nombre: "Ana",
          apellidos: "Compradora Ruiz",
          nif: "12345678A",
          calle: "Calle Sol",
          numero: "1",
          cp: "14001",
          localidad: "Cordoba",
          provincia: "Cordoba",
        };
      }
      if (code === 202) {
        return {
          cod_cli: 202,
          nombre: "Jose",
          apellidos: "Vendedor Lopez",
          nif: "87654321B",
          calle: "Avenida Luna",
          numero: "5",
          cp: "14002",
          localidad: "Cordoba",
          provincia: "Cordoba",
        };
      }
      return null;
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ====================================================================
// 1. Detección de estados trigger
// ====================================================================

describe("isSmartClosingTrigger", () => {
  it.each([
    "Reservada",
    "Reserva Señal",
    "reserva",
    "Arras firmadas",
    "ARRAS PENDIENTES",
    "Señal recibida",
    "Senal compra",
  ])("detecta '%s' como trigger de Smart Closing", (estado) => {
    expect(isSmartClosingTrigger(estado)).toBe(true);
  });

  it.each([
    "Activa",
    "Vendida",
    "Retirada",
    "En exclusiva",
  ])("no dispara para '%s'", (estado) => {
    expect(isSmartClosingTrigger(estado)).toBe(false);
  });
});

// ====================================================================
// 2. Handler de ESTADO_CAMBIADO → encola GENERATE_CONTRACT_DRAFT
// ====================================================================

describe("handleEstadoCambiado", () => {
  it("encola UPDATE_PROPERTY_PROJECTION + GENERATE_CONTRACT_DRAFT cuando newEstado es Reservada", async () => {
    const event = fakeEvent();
    const result = await handleEstadoCambiado(event);

    expect(result.success).toBe(true);
    expect(result.followUpJobs).toHaveLength(2);

    const jobTypes = result.followUpJobs!.map((j) => j.type);
    expect(jobTypes).toContain("UPDATE_PROPERTY_PROJECTION");
    expect(jobTypes).toContain("GENERATE_CONTRACT_DRAFT");

    const draftJob = result.followUpJobs!.find(
      (j) => j.type === "GENERATE_CONTRACT_DRAFT",
    )!;
    expect(draftJob.payload).toEqual(
      expect.objectContaining({
        propertyCode: "1001",
        newEstado: "Reservada",
      }),
    );
  });

  it("encola UPDATE_PROPERTY_PROJECTION + PROCESS_EVENT (OPERACION_CERRADA) cuando el estado indica cierre", async () => {
    mockAppendEvent.mockResolvedValueOnce({
      id: "evt-closed-001",
      position: 2n,
      type: "OPERACION_CERRADA",
      aggregateType: "OPERACION",
      aggregateId: "1001",
      version: null,
      payload: {},
      metadata: null,
      correlationId: null,
      causationId: "evt-e2e-001",
      occurredAt: new Date(),
      createdAt: new Date(),
    });

    const event = fakeEvent({
      payload: {
        previousEstado: "Activa",
        newEstado: "Vendida",
        otherChangedFields: [],
        snapshot: { codigo: "1001" },
        detectedAt: new Date().toISOString(),
      },
    });

    const result = await handleEstadoCambiado(event);

    expect(result.success).toBe(true);
    expect(result.followUpJobs).toHaveLength(2);
    expect(result.followUpJobs![0].type).toBe("UPDATE_PROPERTY_PROJECTION");
    expect(result.followUpJobs![1].type).toBe("PROCESS_EVENT");
    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "OPERACION_CERRADA",
        aggregateType: "OPERACION",
        aggregateId: "1001",
      }),
    );
  });
});

// ====================================================================
// 3. Flujo E2E happy path: extracción → DOCX → Cloudinary → evento
// ====================================================================

describe("handleGenerateContractDraft — E2E happy path", () => {
  it("completa el ciclo: extracción → DOCX → Cloudinary → CONTRATO_BORRADOR_GENERADO", async () => {
    mockCreateDeps.mockReturnValue(happyPathDeps());

    mockBuildPayload.mockResolvedValue({
      ok: true,
      input: {
        kind: "arras",
        templateVersion: "OP-1001_Arras_v1",
        payload: {
          documentDateIso: "2026-05-21",
          signPlace: "Cordoba",
          buyers: [
            {
              fullName: "Ana Compradora Ruiz",
              nationalId: "12345678A",
              fiscalAddress: { streetLine: "Calle Sol 1", municipality: "Cordoba" },
            },
          ],
          sellers: [
            {
              fullName: "Jose Vendedor Lopez",
              nationalId: "87654321B",
              fiscalAddress: { streetLine: "Avenida Luna 5", municipality: "Cordoba" },
            },
          ],
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
            arrasRegime: "penitencial",
            keysHandover: "same_day_as_deed",
            validitySubjectToSellerReceipt: true,
          },
        },
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
      publicId: "contracts/OP-1001/OP-1001_Arras_v1.docx",
      secureUrl: "https://res.cloudinary.com/demo/raw/upload/contracts/OP-1001/OP-1001_Arras_v1.docx",
      url: "http://res.cloudinary.com/demo/raw/upload/contracts/OP-1001/OP-1001_Arras_v1.docx",
      bytes: 12345,
      format: "docx",
      resourceType: "raw",
      createdAt: "2026-03-24T15:00:00Z",
    });

    mockAppendEvent.mockResolvedValue({
      id: "evt-borrador-001",
      position: 10n,
      type: "CONTRATO_BORRADOR_GENERADO" as const,
      aggregateType: "PROPERTY" as const,
      aggregateId: "1001",
      version: null,
      payload: {},
      metadata: null,
      correlationId: null,
      causationId: null,
      occurredAt: new Date(),
      createdAt: new Date(),
    });

    const job = fakeJobRecord();
    const result = await handleGenerateContractDraft(job);

    expect(result.success).toBe(true);

    // Extracción invocada
    expect(mockBuildPayload).toHaveBeenCalledTimes(1);
    expect(mockBuildPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyCode: "1001",
        templateVersion: "OP-1001_Arras_v1",
      }),
      expect.anything(),
    );

    // Upload a Cloudinary invocado con buffer DOCX válido
    expect(mockUpload).toHaveBeenCalledTimes(1);
    const uploadCall = mockUpload.mock.calls[0][0];
    expect(uploadCall.folder).toBe("contracts/OP-1001");
    expect(uploadCall.tags).toEqual(expect.arrayContaining(["draft", "arras"]));
    expect(Buffer.isBuffer(uploadCall.buffer)).toBe(true);
    expect(uploadCall.buffer.length).toBeGreaterThan(100);
    expect(uploadCall.buffer.subarray(0, 2).toString()).toBe("PK");

    // Evento CONTRATO_BORRADOR_GENERADO emitido
    expect(mockAppendEvent).toHaveBeenCalledTimes(1);
    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "CONTRATO_BORRADOR_GENERADO",
        aggregateType: "PROPERTY",
        aggregateId: "1001",
      }),
    );

    const eventPayload = mockAppendEvent.mock.calls[0][0].payload as Record<string, unknown>;
    expect(eventPayload.documentKind).toBe("arras");
    expect(eventPayload.cloudinary).toEqual(
      expect.objectContaining({
        publicId: expect.stringContaining("OP-1001_Arras_v1"),
        secureUrl: expect.stringContaining("cloudinary.com"),
        bytes: 12345,
      }),
    );
    expect(eventPayload.templateVersion).toBe("OP-1001_Arras_v1");

    // No se llamó a emitContractDataIncomplete
    expect(mockEmitIncomplete).not.toHaveBeenCalled();
  });
});

// ====================================================================
// 4. Flujo E2E con datos incompletos
// ====================================================================

describe("handleGenerateContractDraft — datos incompletos", () => {
  it("emite DATOS_INCOMPLETOS y no genera DOCX cuando faltan datos", async () => {
    mockCreateDeps.mockReturnValue(happyPathDeps());

    mockBuildPayload.mockResolvedValue({
      ok: false,
      input: {
        kind: "arras",
        templateVersion: "m8-v1",
        payload: {} as never,
      },
      issues: [
        {
          event: "DATOS_INCOMPLETOS",
          documentKind: "arras",
          fieldPath: "buyers.0.nationalId",
          message: "DNI obligatorio",
        },
      ],
      validationSignal: {
        event: {
          event: "DATOS_INCOMPLETOS",
          demandId: "1001",
          propertyCode: "1001",
          operationId: "OP-1001",
          documentKind: "arras",
          missingRequiredCategories: ["dni"],
          issues: [
            {
              event: "DATOS_INCOMPLETOS",
              documentKind: "arras",
              fieldPath: "buyers.0.nationalId",
              message: "DNI obligatorio",
            },
          ],
        },
        commercialTask: {
          type: "CONTRACT_DATA_COMPLETION",
          demandId: "1001",
          propertyCode: "1001",
          operationId: "OP-1001",
          assignedCommercialId: "system",
          title: "Completar datos",
          description: "Faltan datos obligatorios para generar contrato: dni.",
          priority: "HIGH",
          status: "PENDING",
          missingRequiredCategories: ["dni"],
          issues: [
            {
              event: "DATOS_INCOMPLETOS",
              documentKind: "arras",
              fieldPath: "buyers.0.nationalId",
              message: "DNI obligatorio",
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
      event: {
        id: "evt-incomplete-001",
        position: 5n,
        type: "DATOS_INCOMPLETOS" as const,
        aggregateType: "DEMAND" as const,
        aggregateId: "1001",
        version: null,
        payload: {},
        metadata: null,
        correlationId: null,
        causationId: null,
        occurredAt: new Date(),
        createdAt: new Date(),
      },
      job: {
        id: "job-incomplete-001",
        type: "NOTIFY_CONTRACT_DATA_INCOMPLETE" as const,
        status: "PENDING" as const,
        payload: {},
        priority: 20,
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
        sourceEventId: "evt-incomplete-001",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const job = fakeJobRecord();
    const result = await handleGenerateContractDraft(job);

    expect(result.success).toBe(true);

    // Se emitió datos incompletos
    expect(mockEmitIncomplete).toHaveBeenCalledTimes(1);

    // No se subió nada a Cloudinary
    expect(mockUpload).not.toHaveBeenCalled();

    // No se emitió CONTRATO_BORRADOR_GENERADO
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });
});

// ====================================================================
// 5. Validación de payload del job
// ====================================================================

describe("handleGenerateContractDraft — validación", () => {
  it("retorna error permanente si el job no tiene propertyCode", async () => {
    const job = fakeJobRecord({ payload: {} });
    const result = await handleGenerateContractDraft(job);

    expect(result.success).toBe(false);
    expect(result.permanent).toBe(true);
  });
});
