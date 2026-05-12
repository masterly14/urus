import {
  AggregateType,
  EventType,
  type Prisma,
  type VisitWorkItem,
  VisitWorkItemStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";
import { enqueueJob } from "@/lib/job-queue";
import type { JsonValue } from "@/lib/event-store/types";
import {
  getVisitInterestPackageByDemand,
  type VisitInterestDemand,
  type VisitInterestProperty,
} from "./interest-package";

type VisitPropertySnapshot = {
  propertyId: string;
  source: VisitInterestProperty["source"];
  title: string;
  reference: string;
  cadastralReference: string | null;
  address: string;
  city: string | null;
  zone: string | null;
  price: number | null;
  rooms: number | null;
  metersBuilt: number | null;
  portalUrl: string | null;
  interestedAt: string;
};

type VisitContactSnapshot = VisitInterestProperty["contact"] & {
  missingContactPhone: boolean;
};

export type VisitWorkItemDto = {
  id: string;
  demandId: string;
  draftDemandId: string | null;
  selectionId: string | null;
  propertyId: string;
  draftPropertyId: string | null;
  propertySource: string;
  comercialId: string;
  buyerName: string;
  buyerPhone: string;
  propertySnapshot: VisitPropertySnapshot;
  contactSnapshot: VisitContactSnapshot;
  nluSummary: string;
  status: VisitWorkItemStatus;
  scheduledSessionId: string | null;
  scheduledSlotStart: string | null;
  scheduledSlotEnd: string | null;
  missingContactPhone: boolean;
  createdAt: string;
  updatedAt: string;
  source: "work_item" | "legacy_interest";
};

type CreateVisitWorkItemInput = {
  demand: VisitInterestDemand;
  selectionId: string | null;
  property: VisitInterestProperty;
  nluSummary?: string;
  causationId?: string | null;
  correlationId?: string | null;
};

type CreateVisitWorkItemsForDemandInput = {
  demandId: string;
  propertyIds?: string[];
  nluSummary?: string;
  causationId?: string | null;
  correlationId?: string | null;
};

export type VisitWorkItemCreationResult = {
  workItem: VisitWorkItem;
  created: boolean;
};

function cleanString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toSelectionKey(selectionId: string | null): string {
  return selectionId?.trim() ?? "";
}

function buildPropertySnapshot(property: VisitInterestProperty): VisitPropertySnapshot {
  return {
    propertyId: property.propertyId,
    source: property.source,
    title: property.title,
    reference: property.reference,
    cadastralReference: property.cadastralReference,
    address: property.address,
    city: property.city,
    zone: property.zone,
    price: property.price,
    rooms: property.rooms,
    metersBuilt: property.metersBuilt,
    portalUrl: property.portalUrl,
    interestedAt: property.interestedAt,
  };
}

function buildContactSnapshot(property: VisitInterestProperty): VisitContactSnapshot {
  return {
    ...property.contact,
    missingContactPhone: property.missingContactPhone,
  };
}

function getInitialStatus(property: VisitInterestProperty): VisitWorkItemStatus {
  return property.missingContactPhone
    ? VisitWorkItemStatus.INCOMPLETE
    : VisitWorkItemStatus.PENDING_SCHEDULE;
}

function buildEventPayload(input: {
  workItem: VisitWorkItem;
  created: boolean;
}): JsonValue {
  const { workItem, created } = input;
  return {
    visitWorkItemId: workItem.id,
    demandId: workItem.demandId,
    draftDemandId: workItem.draftDemandId || null,
    selectionId: workItem.selectionId || null,
    propertyId: workItem.propertyId,
    draftPropertyId: workItem.draftPropertyId || null,
    propertySource: workItem.propertySource,
    comercialId: workItem.comercialId,
    status: workItem.status,
    missingContactPhone: workItem.missingContactPhone,
    created,
  } as unknown as JsonValue;
}

async function emitVisitPrecreatedEvent(input: {
  workItem: VisitWorkItem;
  created: boolean;
  causationId?: string | null;
  correlationId?: string | null;
}) {
  const aggregateType = input.workItem.demandId
    ? AggregateType.DEMAND
    : AggregateType.LEAD;
  const aggregateId = input.workItem.demandId || input.workItem.draftDemandId || "";
  if (!aggregateId) return null;

  const existingEvent = await prisma.event.findFirst({
    where: {
      type: EventType.VISITA_PRECREADA,
      aggregateType,
      aggregateId,
      payload: {
        path: ["visitWorkItemId"],
        equals: input.workItem.id,
      },
    },
    select: { id: true },
  });

  if (existingEvent) return null;

  const event = await appendEvent({
    type: EventType.VISITA_PRECREADA,
    aggregateType,
    aggregateId,
    payload: buildEventPayload(input),
    causationId: input.causationId ?? undefined,
    correlationId: input.correlationId ?? undefined,
  });

  await enqueueJob({
    type: "PROCESS_EVENT",
    payload: { eventId: event.id },
    sourceEventId: event.id,
    idempotencyKey: `process_event:${event.id}`,
  });

  return event;
}

export async function createOrUpdateVisitWorkItemFromInterest(
  input: CreateVisitWorkItemInput,
): Promise<VisitWorkItemCreationResult> {
  if (!input.demand.comercialId) {
    throw new Error(`La demanda ${input.demand.demandId} no tiene comercial asignado`);
  }

  const selectionId = toSelectionKey(input.selectionId);
  const status = getInitialStatus(input.property);
  const existing = await prisma.visitWorkItem.findFirst({
    where: {
      demandId: input.demand.demandId,
      draftDemandId: null,
      selectionId,
      propertyId: input.property.propertyId,
      draftPropertyId: null,
    },
  });

  const data = {
    propertySource: input.property.source,
    comercialId: input.demand.comercialId,
    buyerName: input.demand.demandName || input.demand.demandId,
    buyerPhone: input.demand.buyerPhone,
    propertySnapshot: buildPropertySnapshot(input.property) as unknown as Prisma.InputJsonValue,
    contactSnapshot: buildContactSnapshot(input.property) as unknown as Prisma.InputJsonValue,
    nluSummary: input.nluSummary ?? "",
    missingContactPhone: input.property.missingContactPhone,
  };

  const workItem = existing
    ? await prisma.visitWorkItem.update({
        where: { id: existing.id },
        data: {
          ...data,
          status: existing.status === VisitWorkItemStatus.INCOMPLETE
            ? status
            : existing.status,
        },
      })
    : await prisma.visitWorkItem.create({
        data: {
          demandId: input.demand.demandId,
          draftDemandId: null,
          selectionId,
          propertyId: input.property.propertyId,
          draftPropertyId: null,
          status,
          ...data,
        },
      });

  const created = !existing;
  await emitVisitPrecreatedEvent({
    workItem,
    created,
    causationId: input.causationId,
    correlationId: input.correlationId,
  });

  return { workItem, created };
}

export async function createOrUpdateVisitWorkItemsForDemandInterest(
  input: CreateVisitWorkItemsForDemandInput,
): Promise<VisitWorkItemCreationResult[]> {
  const pkg = await getVisitInterestPackageByDemand(input.demandId);
  if (!pkg) return [];

  const propertyFilter = input.propertyIds?.length
    ? new Set(input.propertyIds)
    : null;
  const properties = propertyFilter
    ? pkg.properties.filter((property) => propertyFilter.has(property.propertyId))
    : pkg.properties;

  const results: VisitWorkItemCreationResult[] = [];
  for (const property of properties) {
    results.push(
      await createOrUpdateVisitWorkItemFromInterest({
        demand: pkg.demand,
        selectionId: pkg.selectionId,
        property,
        nluSummary: input.nluSummary,
        causationId: input.causationId,
        correlationId: input.correlationId,
      }),
    );
  }

  return results;
}

export async function createManualVisitWorkItem(input: {
  demandId?: string;
  draftDemandId?: string;
  propertyId?: string;
  draftPropertyId?: string;
  comercialId: string;
  nluSummary?: string;
  causationId?: string | null;
  correlationId?: string | null;
}): Promise<VisitWorkItemCreationResult> {
  const hasDemand = Boolean(input.demandId) !== Boolean(input.draftDemandId);
  const hasProperty = Boolean(input.propertyId) !== Boolean(input.draftPropertyId);
  if (!hasDemand || !hasProperty) {
    throw new Error("Debes seleccionar una demanda (real o provisional) y una propiedad (real o provisional)");
  }

  const [demand, draftDemand, property, draftProperty] = await Promise.all([
    input.demandId
      ? prisma.demandCurrent.findUnique({
          where: { codigo: input.demandId },
          select: {
            codigo: true,
            nombre: true,
            telefono: true,
            comercialId: true,
            leadStatus: true,
          },
        })
      : Promise.resolve(null),
    input.draftDemandId
      ? prisma.draftDemand.findUnique({
          where: { id: input.draftDemandId },
          select: {
            id: true,
            buyerName: true,
            buyerPhone: true,
            comercialId: true,
            status: true,
          },
        })
      : Promise.resolve(null),
    input.propertyId
      ? prisma.propertyCurrent.findUnique({
          where: { codigo: input.propertyId },
          select: {
            codigo: true,
            ref: true,
            refCatastral: true,
            titulo: true,
            precio: true,
            metrosConstruidos: true,
            habitaciones: true,
            ciudad: true,
            zona: true,
            propietarioNombre: true,
            propietarioPhone: true,
            portalUrl: true,
          },
        })
      : Promise.resolve(null),
    input.draftPropertyId
      ? prisma.draftProperty.findUnique({
          where: { id: input.draftPropertyId },
          select: {
            id: true,
            ownerPhone: true,
            cadastralRef: true,
          },
        })
      : Promise.resolve(null),
  ]);

  if (input.demandId && !demand) throw new Error(`Demanda ${input.demandId} no encontrada`);
  if (input.draftDemandId && !draftDemand) throw new Error("Demanda provisional no encontrada");
  if (input.propertyId && !property) throw new Error(`Propiedad ${input.propertyId} no encontrada`);
  if (input.draftPropertyId && !draftProperty) throw new Error("Propiedad provisional no encontrada");

  const contactPhones = cleanString(property?.propietarioPhone ?? draftProperty?.ownerPhone ?? "")
    ? [cleanString(property?.propietarioPhone ?? draftProperty?.ownerPhone ?? "")!]
    : [];

  const demandId = demand?.codigo ?? "";
  const propertyId = property?.codigo ?? "";
  const draftDemandId = draftDemand?.id ?? null;
  const draftPropertyId = draftProperty?.id ?? null;
  const selectionId = "";

  const existing = await prisma.visitWorkItem.findFirst({
    where: {
      demandId,
      draftDemandId,
      selectionId,
      propertyId,
      draftPropertyId,
    },
  });

  const nextPropertyId = property?.codigo ?? draftProperty?.id ?? "";
  const data = {
    demandId,
    draftDemandId,
    selectionId,
    propertyId,
    draftPropertyId,
    propertySource: property ? "internal" : "draft",
    comercialId: input.comercialId || demand?.comercialId || draftDemand?.comercialId || "",
    buyerName: demand?.nombre || draftDemand?.buyerName || draftDemand?.id || demandId || "Comprador provisional",
    buyerPhone: demand?.telefono || draftDemand?.buyerPhone || "",
    propertySnapshot: {
      propertyId: nextPropertyId,
      source: property ? "internal" : "external",
      title: property
        ? (cleanString(property.titulo) ?? cleanString(property.ref) ?? property.codigo)
        : `Propiedad provisional ${draftProperty?.cadastralRef ?? draftProperty?.id}`,
      reference: property
        ? (cleanString(property.ref) ?? property.codigo)
        : `DRAFT-${draftProperty?.id ?? ""}`,
      cadastralReference: property
        ? cleanString(property.refCatastral)
        : cleanString(draftProperty?.cadastralRef),
      address: property
        ? ([property.zona, property.ciudad].map(cleanString).filter(Boolean).join(", ") || "Direccion no disponible")
        : "Direccion pendiente de completar",
      city: property ? cleanString(property.ciudad) : null,
      zone: property ? cleanString(property.zona) : null,
      price: property && property.precio > 0 ? property.precio : null,
      rooms: property && property.habitaciones > 0 ? property.habitaciones : null,
      metersBuilt: property && property.metrosConstruidos > 0 ? property.metrosConstruidos : null,
      portalUrl: property ? cleanString(property.portalUrl) : null,
      interestedAt: new Date().toISOString(),
    } as unknown as Prisma.InputJsonValue,
    contactSnapshot: {
      kind: "propietario",
      name: property ? cleanString(property.propietarioNombre) : "Propietario provisional",
      phones: contactPhones,
      source: property ? "property_current" : "draft_property",
      missingContactPhone: contactPhones.length === 0,
    } as unknown as Prisma.InputJsonValue,
    nluSummary: input.nluSummary ?? "Visita creada manualmente por el comercial.",
    missingContactPhone: contactPhones.length === 0,
  };

  const workItem = existing
    ? await prisma.visitWorkItem.update({
        where: { id: existing.id },
        data: {
          ...data,
          status: existing.status === VisitWorkItemStatus.INCOMPLETE
            ? (contactPhones.length === 0 ? VisitWorkItemStatus.INCOMPLETE : VisitWorkItemStatus.PENDING_SCHEDULE)
            : existing.status,
        },
      })
    : await prisma.visitWorkItem.create({
        data: {
          ...data,
          status: contactPhones.length === 0
            ? VisitWorkItemStatus.INCOMPLETE
            : VisitWorkItemStatus.PENDING_SCHEDULE,
        },
      });

  const created = !existing;
  await emitVisitPrecreatedEvent({
    workItem,
    created,
    causationId: input.causationId,
    correlationId: input.correlationId,
  });

  return { workItem, created };
}

export async function getVisitWorkItem(id: string): Promise<VisitWorkItem | null> {
  return prisma.visitWorkItem.findUnique({ where: { id } });
}

export async function listVisitWorkItems(input: {
  visitId?: string;
  comercialId?: string | null;
  status?: VisitWorkItemStatus;
  demandId?: string;
  selectionId?: string;
  propertyId?: string;
  limit?: number;
} = {}): Promise<VisitWorkItem[]> {
  return prisma.visitWorkItem.findMany({
    where: {
      ...(input.visitId ? { id: input.visitId } : {}),
      ...(input.comercialId ? { comercialId: input.comercialId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.demandId ? { demandId: input.demandId } : {}),
      ...(input.selectionId ? { selectionId: input.selectionId } : {}),
      ...(input.propertyId ? { propertyId: input.propertyId } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: input.limit ?? 50,
  });
}

export function serializeVisitWorkItem(
  workItem: VisitWorkItem,
  scheduledSlot?: { confirmedSlotStart: Date | null; confirmedSlotEnd: Date | null } | null,
): VisitWorkItemDto {
  return {
    id: workItem.id,
    demandId: workItem.demandId,
    draftDemandId: workItem.draftDemandId || null,
    selectionId: workItem.selectionId || null,
    propertyId: workItem.propertyId,
    draftPropertyId: workItem.draftPropertyId || null,
    propertySource: workItem.propertySource,
    comercialId: workItem.comercialId,
    buyerName: workItem.buyerName,
    buyerPhone: workItem.buyerPhone,
    propertySnapshot: workItem.propertySnapshot as unknown as VisitPropertySnapshot,
    contactSnapshot: workItem.contactSnapshot as unknown as VisitContactSnapshot,
    nluSummary: workItem.nluSummary,
    status: workItem.status,
    scheduledSessionId: workItem.scheduledSessionId,
    scheduledSlotStart: scheduledSlot?.confirmedSlotStart?.toISOString() ?? null,
    scheduledSlotEnd: scheduledSlot?.confirmedSlotEnd?.toISOString() ?? null,
    missingContactPhone: workItem.missingContactPhone,
    createdAt: workItem.createdAt.toISOString(),
    updatedAt: workItem.updatedAt.toISOString(),
    source: "work_item",
  };
}

export function serializeLegacyVisitInterest(input: {
  demand: VisitInterestDemand;
  selectionId: string | null;
  property: VisitInterestProperty;
}): VisitWorkItemDto {
  return {
    id: `legacy:${input.demand.demandId}:${input.selectionId ?? "none"}:${input.property.propertyId}`,
    demandId: input.demand.demandId,
    draftDemandId: null,
    selectionId: input.selectionId,
    propertyId: input.property.propertyId,
    draftPropertyId: null,
    propertySource: input.property.source,
    comercialId: input.demand.comercialId ?? "",
    buyerName: input.demand.demandName,
    buyerPhone: input.demand.buyerPhone,
    propertySnapshot: buildPropertySnapshot(input.property),
    contactSnapshot: buildContactSnapshot(input.property),
    nluSummary: "",
    status: input.property.missingContactPhone
      ? VisitWorkItemStatus.INCOMPLETE
      : VisitWorkItemStatus.PENDING_SCHEDULE,
    scheduledSessionId: null,
    scheduledSlotStart: null,
    scheduledSlotEnd: null,
    missingContactPhone: input.property.missingContactPhone,
    createdAt: input.property.interestedAt,
    updatedAt: input.property.interestedAt,
    source: "legacy_interest",
  };
}

export async function markVisitWorkItemScheduled(input: {
  id: string;
  scheduledSessionId: string;
}): Promise<VisitWorkItem> {
  return prisma.visitWorkItem.update({
    where: { id: input.id },
    data: {
      status: VisitWorkItemStatus.SCHEDULED,
      scheduledSessionId: input.scheduledSessionId,
    },
  });
}

export async function decideVisitWorkItem(input: {
  id: string;
  status:
    | typeof VisitWorkItemStatus.DECIDED_GREEN
    | typeof VisitWorkItemStatus.DECIDED_YELLOW
    | typeof VisitWorkItemStatus.DECIDED_RED;
}): Promise<VisitWorkItem> {
  return prisma.visitWorkItem.update({
    where: { id: input.id },
    data: { status: input.status },
  });
}
