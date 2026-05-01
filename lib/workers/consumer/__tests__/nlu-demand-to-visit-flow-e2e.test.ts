import { describe, expect, it, vi, beforeEach } from "vitest";
import { VisitWorkItemStatus } from "@prisma/client";
import { startNluInitialContactForDemand } from "@/lib/nlu/initial-contact";
import { createOrUpdateVisitWorkItemFromInterest } from "@/lib/visitas/work-items";
import { decideVisitWorkItem } from "@/lib/visitas/decisions";
import type { VisitInterestDemand, VisitInterestProperty } from "@/lib/visitas/interest-package";

const store = {
  session: null as Record<string, unknown> | null,
  workItem: null as Record<string, unknown> | null,
};

const mockAppendEvent = vi.fn();
const mockEnqueueJob = vi.fn();
const mockSendTemplate = vi.fn();
const mockQueryRaw = vi.fn();

vi.mock("@/lib/event-store", () => ({
  appendEvent: (...args: unknown[]) => mockAppendEvent(...args),
}));

vi.mock("@/lib/job-queue", () => ({
  enqueueJob: (...args: unknown[]) => mockEnqueueJob(...args),
}));

vi.mock("@/lib/whatsapp/send", () => ({
  WHATSAPP_TEMPLATES: {
    NLU_DEMANDA_CONTACTO_INICIAL: "nlu_demanda_contacto_inicial",
  },
  sendTemplateMessage: (...args: unknown[]) => mockSendTemplate(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    demandCurrent: {
      findUnique: vi.fn().mockResolvedValue({
        codigo: "DEM-001",
        nombre: "Comprador E2E",
        telefono: "34600111222",
        leadStatus: "NUEVO",
      }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    demandSnapshot: {
      findUnique: vi.fn().mockResolvedValue({ raw: {} }),
    },
    whatsAppBuyerSession: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockImplementation(({ create, update }) => {
        store.session = store.session ? { ...store.session, ...update } : create;
        return Promise.resolve(store.session);
      }),
    },
    visitWorkItem: {
      findUnique: vi.fn().mockImplementation(() => Promise.resolve(store.workItem)),
      create: vi.fn().mockImplementation(({ data }) => {
        store.workItem = {
          id: "vwi-e2e",
          ...data,
          scheduledSessionId: null,
          createdAt: new Date("2026-04-30T10:00:00Z"),
          updatedAt: new Date("2026-04-30T10:00:00Z"),
        };
        return Promise.resolve(store.workItem);
      }),
      update: vi.fn().mockImplementation(({ data }) => {
        store.workItem = { ...store.workItem, ...data };
        return Promise.resolve(store.workItem);
      }),
    },
    event: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    operacion: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "op-1", codigo: "OP-2026-0001" }),
    },
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
  },
}));

const demand: VisitInterestDemand = {
  demandId: "DEM-001",
  demandName: "Comprador E2E",
  buyerPhone: "34600111222",
  comercialId: "com-001",
  leadStatus: "VISITA_PENDIENTE",
};

const property: VisitInterestProperty = {
  propertyId: "PROP-001",
  source: "external",
  title: "Piso E2E",
  reference: "PROP-001",
  cadastralReference: null,
  address: "Calle E2E 1",
  city: "Cordoba",
  zone: "Centro",
  price: 250000,
  rooms: 3,
  metersBuilt: 90,
  portalUrl: null,
  contact: {
    kind: "agencia",
    name: "Agencia E2E",
    phones: ["34666777888"],
    source: "microsite_json",
  },
  missingContactPhone: false,
  interestedAt: "2026-04-30T10:00:00Z",
};

describe("NLU demand to visit dry-run E2E", () => {
  beforeEach(() => {
    store.session = null;
    store.workItem = null;
    vi.clearAllMocks();
    mockAppendEvent.mockImplementation(({ type }) => Promise.resolve({ id: `evt-${type}` }));
    mockEnqueueJob.mockResolvedValue({ id: "job-1" });
    mockSendTemplate.mockResolvedValue({ messages: [{ id: "wamid.e2e" }] });
    mockQueryRaw.mockResolvedValue([{ lastValue: 1 }]);
  });

  it("contacta demanda, crea work item y dispara re-perfilado amarillo", async () => {
    const contact = await startNluInitialContactForDemand({
      demandId: "DEM-001",
      dryRun: true,
    });
    expect(contact.sent).toBe(true);
    expect(store.session).toMatchObject({
      waId: "34600111222",
      demandId: "DEM-001",
      conversationPhase: "initial_nlu_discovery",
    });

    const workItemResult = await createOrUpdateVisitWorkItemFromInterest({
      demand,
      selectionId: "SEL-001",
      property,
    });
    expect(workItemResult.workItem).toMatchObject({
      id: "vwi-e2e",
      status: VisitWorkItemStatus.PENDING_SCHEDULE,
    });

    const decision = await decideVisitWorkItem({
      visitWorkItemId: "vwi-e2e",
      decision: "yellow",
      notes: "Busca otra zona",
      decidedBy: "Comercial E2E",
    });
    expect(decision.branchEventId).toBe("evt-DEMANDA_REPERFILADO_SOLICITADO");
    expect(store.workItem).toMatchObject({
      status: VisitWorkItemStatus.DECIDED_YELLOW,
    });
    expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: "DEMANDA_REPERFILADO_SOLICITADO",
    }));
  });
});
