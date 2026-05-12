import { beforeEach, describe, expect, it, vi } from "vitest";
import { VisitWorkItemStatus } from "@prisma/client";
import {
  createOrUpdateVisitWorkItemFromInterest,
  createOrUpdateVisitWorkItemsForDemandInterest,
  listVisitWorkItems,
  serializeLegacyVisitInterest,
  serializeVisitWorkItem,
} from "../work-items";
import type { VisitInterestDemand, VisitInterestPackage, VisitInterestProperty } from "../interest-package";

const mockFindUnique = vi.fn();
const mockFindFirst = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockFindMany = vi.fn();
const mockFindFirstEvent = vi.fn();
const mockAppendEvent = vi.fn();
const mockEnqueueJob = vi.fn();
const mockGetPackage = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    operacion: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    visitWorkItem: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
    event: {
      findFirst: (...args: unknown[]) => mockFindFirstEvent(...args),
    },
    demandCurrent: {
      update: vi.fn(),
    },
    demandSnapshot: {
      findUnique: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

vi.mock("@/lib/event-store", () => ({
  appendEvent: (...args: unknown[]) => mockAppendEvent(...args),
}));

vi.mock("@/lib/job-queue", () => ({
  enqueueJob: (...args: unknown[]) => mockEnqueueJob(...args),
}));

vi.mock("../interest-package", async () => {
  const actual = await vi.importActual<typeof import("../interest-package")>("../interest-package");
  return {
    ...actual,
    getVisitInterestPackageByDemand: (...args: unknown[]) => mockGetPackage(...args),
  };
});

const demand: VisitInterestDemand = {
  demandId: "DEM-001",
  demandName: "Comprador Test",
  buyerPhone: "34600111222",
  comercialId: "com-001",
  leadStatus: "VISITA_PENDIENTE",
};

function makeProperty(overrides: Partial<VisitInterestProperty> = {}): VisitInterestProperty {
  return {
    propertyId: "prop-001",
    source: "external",
    title: "Piso exterior",
    reference: "prop-001",
    cadastralReference: null,
    address: "Calle Test 1",
    city: "Cordoba",
    zone: "Centro",
    price: 250000,
    rooms: 3,
    metersBuilt: 90,
    portalUrl: "https://portal.test/prop-001",
    contact: {
      kind: "agencia",
      name: "Agencia Test",
      phones: ["34666777888"],
      source: "microsite_json",
    },
    missingContactPhone: false,
    interestedAt: "2026-04-30T10:00:00.000Z",
    ...overrides,
  };
}

function makeWorkItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "vwi-001",
    demandId: "DEM-001",
    draftDemandId: null,
    selectionId: "sel-001",
    propertyId: "prop-001",
    draftPropertyId: null,
    propertySource: "external",
    comercialId: "com-001",
    buyerName: "Comprador Test",
    buyerPhone: "34600111222",
    propertySnapshot: {},
    contactSnapshot: {},
    nluSummary: "",
    status: VisitWorkItemStatus.PENDING_SCHEDULE,
    scheduledSessionId: null,
    missingContactPhone: false,
    createdAt: new Date("2026-04-30T10:00:00.000Z"),
    updatedAt: new Date("2026-04-30T10:00:00.000Z"),
    ...overrides,
  };
}

describe("createOrUpdateVisitWorkItemFromInterest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindUnique.mockResolvedValue(null);
    mockFindFirst.mockResolvedValue(null);
    mockFindFirstEvent.mockResolvedValue(null);
    mockAppendEvent.mockResolvedValue({ id: "evt-visit-precreated" });
    mockEnqueueJob.mockResolvedValue({ id: "job-1" });
    mockFindMany.mockResolvedValue([]);
  });

  it("crea un work item PENDING_SCHEDULE cuando hay contacto operativo", async () => {
    const created = makeWorkItem();
    mockCreate.mockResolvedValue(created);

    const result = await createOrUpdateVisitWorkItemFromInterest({
      demand,
      selectionId: "sel-001",
      property: makeProperty(),
      causationId: "evt-source",
    });

    expect(result.created).toBe(true);
    expect(result.workItem).toBe(created);
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        demandId: "DEM-001",
        selectionId: "sel-001",
        propertyId: "prop-001",
        status: VisitWorkItemStatus.PENDING_SCHEDULE,
        missingContactPhone: false,
      }),
    });
    expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: "VISITA_PRECREADA",
      aggregateType: "DEMAND",
      aggregateId: "DEM-001",
      causationId: "evt-source",
    }));
    expect(mockEnqueueJob).toHaveBeenCalledWith(expect.objectContaining({
      type: "PROCESS_EVENT",
      payload: { eventId: "evt-visit-precreated" },
    }));
  });

  it("crea un work item INCOMPLETE cuando falta telefono de propietario o agencia", async () => {
    const created = makeWorkItem({
      status: VisitWorkItemStatus.INCOMPLETE,
      missingContactPhone: true,
    });
    mockCreate.mockResolvedValue(created);

    await createOrUpdateVisitWorkItemFromInterest({
      demand,
      selectionId: "sel-001",
      property: makeProperty({
        contact: {
          kind: "agencia",
          name: "Agencia Test",
          phones: [],
          source: "microsite_json",
        },
        missingContactPhone: true,
      }),
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: VisitWorkItemStatus.INCOMPLETE,
        missingContactPhone: true,
      }),
    });
  });

  it("actualiza de forma idempotente sin duplicar evento si ya existe", async () => {
    const existing = makeWorkItem({ status: VisitWorkItemStatus.PENDING_SCHEDULE });
    mockFindFirst.mockResolvedValue(existing);
    mockUpdate.mockResolvedValue(existing);
    mockFindFirstEvent.mockResolvedValue({ id: "evt-existing" });

    const result = await createOrUpdateVisitWorkItemFromInterest({
      demand,
      selectionId: "sel-001",
      property: makeProperty(),
    });

    expect(result.created).toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "vwi-001" },
      data: expect.objectContaining({
        status: VisitWorkItemStatus.PENDING_SCHEDULE,
      }),
    });
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });
});

describe("createOrUpdateVisitWorkItemsForDemandInterest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindUnique.mockResolvedValue(null);
    mockFindFirst.mockResolvedValue(null);
    mockFindFirstEvent.mockResolvedValue(null);
    mockAppendEvent.mockResolvedValue({ id: "evt-visit-precreated" });
    mockEnqueueJob.mockResolvedValue({ id: "job-1" });
  });

  it("filtra por propertyIds y crea solo la visita interesada", async () => {
    const pkg: VisitInterestPackage = {
      demand,
      selectionId: "sel-001",
      properties: [
        makeProperty({ propertyId: "prop-001" }),
        makeProperty({ propertyId: "prop-002" }),
      ],
    };
    mockGetPackage.mockResolvedValue(pkg);
    mockCreate.mockImplementation(({ data }) => Promise.resolve(makeWorkItem(data)));

    const results = await createOrUpdateVisitWorkItemsForDemandInterest({
      demandId: "DEM-001",
      propertyIds: ["prop-002"],
    });

    expect(results).toHaveLength(1);
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ propertyId: "prop-002" }),
    });
  });
});

describe("listVisitWorkItems and serializers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("aplica filtros de fase 3 al listado de work items", async () => {
    mockFindMany.mockResolvedValue([makeWorkItem()]);

    await listVisitWorkItems({
      visitId: "vwi-001",
      comercialId: "com-001",
      status: VisitWorkItemStatus.PENDING_SCHEDULE,
      demandId: "DEM-001",
      selectionId: "sel-001",
      propertyId: "prop-001",
      limit: 25,
    });

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        id: "vwi-001",
        comercialId: "com-001",
        status: VisitWorkItemStatus.PENDING_SCHEDULE,
        demandId: "DEM-001",
        selectionId: "sel-001",
        propertyId: "prop-001",
      },
      orderBy: { updatedAt: "desc" },
      take: 25,
    });
  });

  it("serializa work items persistidos para la API/UI", () => {
    const workItem = makeWorkItem({
      propertySnapshot: {
        propertyId: "prop-001",
        source: "external",
        title: "Piso exterior",
        reference: "prop-001",
        cadastralReference: null,
        address: "Calle Test 1",
        city: "Cordoba",
        zone: "Centro",
        price: 250000,
        rooms: 3,
        metersBuilt: 90,
        portalUrl: null,
        interestedAt: "2026-04-30T10:00:00.000Z",
      },
      contactSnapshot: {
        kind: "agencia",
        name: "Agencia Test",
        phones: ["34666777888"],
        source: "microsite_json",
        missingContactPhone: false,
      },
    });

    expect(serializeVisitWorkItem(workItem)).toMatchObject({
      id: "vwi-001",
      source: "work_item",
      selectionId: "sel-001",
      status: VisitWorkItemStatus.PENDING_SCHEDULE,
      createdAt: "2026-04-30T10:00:00.000Z",
    });
  });

  it("convierte paquetes legacy a DTOs compatibles con la UI", () => {
    const dto = serializeLegacyVisitInterest({
      demand,
      selectionId: "sel-001",
      property: makeProperty({ missingContactPhone: true }),
    });

    expect(dto).toMatchObject({
      id: "legacy:DEM-001:sel-001:prop-001",
      source: "legacy_interest",
      status: VisitWorkItemStatus.INCOMPLETE,
      missingContactPhone: true,
    });
  });
});
