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
  selectionId: string | null;
  propertyId: string;
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
    selectionId: workItem.selectionId || null,
    propertyId: workItem.propertyId,
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
  const existingEvent = await prisma.event.findFirst({
    where: {
      type: EventType.VISITA_PRECREADA,
      aggregateType: AggregateType.DEMAND,
      aggregateId: input.workItem.demandId,
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
    aggregateType: AggregateType.DEMAND,
    aggregateId: input.workItem.demandId,
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
  const existing = await prisma.visitWorkItem.findUnique({
    where: {
      demandId_selectionId_propertyId: {
        demandId: input.demand.demandId,
        selectionId,
        propertyId: input.property.propertyId,
      },
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
          selectionId,
          propertyId: input.property.propertyId,
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
  demandId: string;
  propertyId: string;
  comercialId: string;
  nluSummary?: string;
  causationId?: string | null;
  correlationId?: string | null;
}): Promise<VisitWorkItemCreationResult> {
  const [demand, property] = await Promise.all([
    prisma.demandCurrent.findUnique({
      where: { codigo: input.demandId },
      select: {
        codigo: true,
        nombre: true,
        telefono: true,
        comercialId: true,
        leadStatus: true,
      },
    }),
    prisma.propertyCurrent.findUnique({
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
    }),
  ]);

  if (!demand) throw new Error(`Demanda ${input.demandId} no encontrada`);
  if (!property) throw new Error(`Propiedad ${input.propertyId} no encontrada`);

  const contactPhones = cleanString(property.propietarioPhone)
    ? [cleanString(property.propietarioPhone)!]
    : [];

  return createOrUpdateVisitWorkItemFromInterest({
    demand: {
      demandId: demand.codigo,
      demandName: demand.nombre,
      buyerPhone: demand.telefono,
      comercialId: demand.comercialId ?? input.comercialId,
      leadStatus: demand.leadStatus,
    },
    selectionId: null,
    property: {
      propertyId: property.codigo,
      source: "internal",
      title: cleanString(property.titulo) ?? cleanString(property.ref) ?? property.codigo,
      reference: cleanString(property.ref) ?? property.codigo,
      cadastralReference: cleanString(property.refCatastral),
      address: [property.zona, property.ciudad].map(cleanString).filter(Boolean).join(", ") || "Direccion no disponible",
      city: cleanString(property.ciudad),
      zone: cleanString(property.zona),
      price: property.precio > 0 ? property.precio : null,
      rooms: property.habitaciones > 0 ? property.habitaciones : null,
      metersBuilt: property.metrosConstruidos > 0 ? property.metrosConstruidos : null,
      portalUrl: cleanString(property.portalUrl),
      contact: {
        kind: "propietario",
        name: cleanString(property.propietarioNombre),
        phones: contactPhones,
        source: "property_current",
      },
      missingContactPhone: contactPhones.length === 0,
      interestedAt: new Date().toISOString(),
    },
    nluSummary: input.nluSummary ?? "Visita creada manualmente por el comercial.",
    causationId: input.causationId,
    correlationId: input.correlationId,
  });
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
    selectionId: workItem.selectionId || null,
    propertyId: workItem.propertyId,
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
    selectionId: input.selectionId,
    propertyId: input.property.propertyId,
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
