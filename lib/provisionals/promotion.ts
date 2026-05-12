import { AggregateType, EventType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";
import { createInmovillaRestClient, createClient, createProperty, searchClient } from "@/lib/inmovilla/rest";
import { writeToInmovilla } from "@/lib/inmovilla/write";

type PromoteDraftDemandInput = {
  draftDemandId: string;
  comercialId: string;
  buyerName?: string | null;
  buyerPhone: string;
  buyerDni?: string | null;
  causationId?: string;
  correlationId?: string;
};

type PromoteDraftPropertyInput = {
  draftPropertyId: string;
  comercialId: string;
  ownerName?: string | null;
  ownerPhone: string;
  cadastralRef: string;
  direccion?: string | null;
  precio?: number | null;
  tipoOperacion?: string | null;
  causationId?: string;
  correlationId?: string;
};

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function toInmovillaPhoneNumber(phone: string): number {
  const digits = digitsOnly(phone);
  if (digits.startsWith("34") && digits.length > 9) {
    return Number(digits.slice(2));
  }
  return Number(digits);
}

function splitName(fullName?: string | null): { nombre: string; apellidos: string } {
  const cleaned = (fullName || "").trim();
  if (!cleaned) return { nombre: "Cliente", apellidos: "Urus" };
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) return { nombre: parts[0], apellidos: "Urus" };
  return {
    nombre: parts[0],
    apellidos: parts.slice(1).join(" "),
  };
}

async function markDraftDemandFailed(draftDemandId: string, errorMessage: string, attempt: number, causationId?: string, correlationId?: string) {
  await prisma.draftDemand.update({
    where: { id: draftDemandId },
    data: {
      status: "OPEN",
      lastPromotionError: errorMessage,
    },
  });

  await appendEvent({
    type: EventType.DEMANDA_PROVISIONAL_PROMOCION_FALLIDA,
    aggregateType: AggregateType.LEAD,
    aggregateId: draftDemandId,
    payload: {
      draftId: draftDemandId,
      attempt,
      message: errorMessage,
    },
    causationId,
    correlationId,
  });
}

async function markDraftPropertyFailed(draftPropertyId: string, errorMessage: string, attempt: number, causationId?: string, correlationId?: string) {
  await prisma.draftProperty.update({
    where: { id: draftPropertyId },
    data: {
      status: "OPEN",
      lastPromotionError: errorMessage,
    },
  });

  await appendEvent({
    type: EventType.PROPIEDAD_PROVISIONAL_PROMOCION_FALLIDA,
    aggregateType: AggregateType.PROPERTY,
    aggregateId: draftPropertyId,
    payload: {
      draftId: draftPropertyId,
      attempt,
      message: errorMessage,
    },
    causationId,
    correlationId,
  });
}

export async function promoteDraftDemand(input: PromoteDraftDemandInput): Promise<{ inmovillaDemandId: string; inmovillaClientId: string }> {
  const draft = await prisma.draftDemand.findUnique({
    where: { id: input.draftDemandId },
  });
  if (!draft) {
    throw new Error("Demanda provisional no encontrada");
  }
  if (draft.inmovillaDemandId) {
    return {
      inmovillaDemandId: draft.inmovillaDemandId,
      inmovillaClientId: draft.inmovillaClientId || "",
    };
  }

  const attempt = draft.promotionAttempts + 1;
  await prisma.draftDemand.update({
    where: { id: draft.id },
    data: {
      status: "PROMOTING",
      promotionAttempts: { increment: 1 },
      lastPromotionError: null,
    },
  });

  try {
    const restClient = createInmovillaRestClient();
    const phone = input.buyerPhone || draft.buyerPhone;
    const inmovillaPhone = toInmovillaPhoneNumber(phone);
    const existingClient = await searchClient(restClient, { telefono: String(inmovillaPhone) });
    const firstClient = Array.isArray(existingClient) ? existingClient[0] : null;

    let clientId = firstClient?.cod_cli ? String(firstClient.cod_cli) : "";
    if (!clientId) {
      const name = splitName(input.buyerName ?? draft.buyerName);
      const createdClient = await createClient(restClient, {
        nombre: name.nombre,
        apellidos: name.apellidos,
        email: `provisional+${digitsOnly(phone)}@urus.local`,
        telefono1: inmovillaPhone,
        prefijotel1: 34,
      });
      clientId = String(createdClient.cod_cli);
    }

    const comercial = await prisma.comercial.findUnique({
      where: { id: draft.comercialId || input.comercialId },
      select: { inmovillaAgentId: true },
    });
    if (!comercial?.inmovillaAgentId) {
      throw new Error("El comercial seleccionado no tiene inmovillaAgentId configurado");
    }
    const agentId = String(comercial.inmovillaAgentId);
    const propertyTypes = draft.demandPropertyTypes || "2799";

    const demandRef = `URUS-DRAFT-${draft.id.slice(-6).toUpperCase()}`;
    const writeResult = await writeToInmovilla("createDemand", {
      query: { ref: demandRef },
      body: {
        tipopropiedad: propertyTypes,
        "clientes-cod_clipriclave": clientId,
        "demandas-keycliclaveext": clientId,
        "demandas-keyagente": agentId,
        "demandas-cliente": input.buyerName ?? draft.buyerName ?? "Cliente provisional",
        "demandas-cliente2": input.buyerDni ?? "",
        "demandas-telefono1": String(inmovillaPhone),
        "demandas-keypaisfijo1": "34",
        "demandas-ventadesde": "0",
        "demandas-ventahasta": String(draft.budgetMax || 9999999),
      },
    }, {
      retryOnSessionExpired: true,
    });

    await prisma.$transaction([
      prisma.draftDemand.update({
        where: { id: draft.id },
        data: {
          status: "PROMOTED",
          inmovillaClientId: clientId,
          inmovillaDemandId: writeResult.demandId,
          promotedAt: new Date(),
          lastPromotionError: null,
        },
      }),
      prisma.visitWorkItem.updateMany({
        where: { draftDemandId: draft.id, demandId: "" },
        data: { demandId: writeResult.demandId },
      }),
      prisma.visitSchedulingSession.updateMany({
        where: { draftDemandId: draft.id, demandId: "" },
        data: { demandId: writeResult.demandId },
      }),
    ]);

    await appendEvent({
      type: EventType.DEMANDA_PROVISIONAL_PROMOVIDA,
      aggregateType: AggregateType.DEMAND,
      aggregateId: writeResult.demandId,
      payload: {
        draftId: draft.id,
        inmovillaId: writeResult.demandId,
        linkedEntities: {
          visitWorkItems: await prisma.visitWorkItem.count({ where: { draftDemandId: draft.id } }),
          visitSessions: await prisma.visitSchedulingSession.count({ where: { draftDemandId: draft.id } }),
        },
      },
      causationId: input.causationId,
      correlationId: input.correlationId,
    });

    return {
      inmovillaDemandId: writeResult.demandId,
      inmovillaClientId: clientId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido al promover demanda provisional";
    await markDraftDemandFailed(draft.id, message, attempt, input.causationId, input.correlationId);
    throw error;
  }
}

export async function promoteDraftProperty(input: PromoteDraftPropertyInput): Promise<{ inmovillaPropertyCode: string }> {
  const draft = await prisma.draftProperty.findUnique({
    where: { id: input.draftPropertyId },
  });
  if (!draft) {
    throw new Error("Propiedad provisional no encontrada");
  }
  if (draft.inmovillaPropertyCode) {
    return { inmovillaPropertyCode: draft.inmovillaPropertyCode };
  }

  const attempt = draft.promotionAttempts + 1;
  await prisma.draftProperty.update({
    where: { id: draft.id },
    data: {
      status: "PROMOTING",
      promotionAttempts: { increment: 1 },
      lastPromotionError: null,
    },
  });

  try {
    const restClient = createInmovillaRestClient();
    if (!draft.keyTipo || !draft.keyLoca) {
      throw new Error("La propiedad provisional no tiene key_tipo/key_loca configurados");
    }
    const keyTipo = draft.keyTipo;
    const keyLoca = draft.keyLoca;
    const operationType = (draft.operationType || input.tipoOperacion || "VENTA").toUpperCase();
    const keyAcci = operationType === "ALQUILER" ? 2 : 1;
    const propertyRef = draft.propertyRef ?? `URUS-DRAFT-PROP-${draft.id.slice(-6).toUpperCase()}`;
    const precio = Math.max(0, Math.round(input.precio ?? 0));
    const response = await createProperty(restClient, {
      ref: propertyRef,
      keyacci: keyAcci,
      key_tipo: keyTipo,
      key_loca: keyLoca,
      prospecto: true,
      precioinmo: precio,
      rcatastral: input.cadastralRef || draft.cadastralRef,
      calle: input.direccion?.trim() || "Direccion pendiente",
    });

    const inmovillaPropertyCode = String(response.cod_ofer ?? "");
    if (!inmovillaPropertyCode) {
      throw new Error("Inmovilla no devolvió cod_ofer al crear prospecto");
    }

    await prisma.$transaction([
      prisma.draftProperty.update({
        where: { id: draft.id },
        data: {
          status: "PROMOTED",
          inmovillaPropertyCode,
          propertyRef,
          promotedAt: new Date(),
          lastPromotionError: null,
        },
      }),
      prisma.visitWorkItem.updateMany({
        where: { draftPropertyId: draft.id, propertyId: "" },
        data: { propertyId: inmovillaPropertyCode },
      }),
      prisma.notaEncargoSession.updateMany({
        where: { draftPropertyId: draft.id, propertyCode: null },
        data: {
          propertyCode: inmovillaPropertyCode,
          propertyRef,
        },
      }),
      prisma.visitSchedulingSession.updateMany({
        where: {
          draftPropertyId: draft.id,
          propertyCode: `DRAFT-PROPERTY:${draft.id}`,
        },
        data: { propertyCode: inmovillaPropertyCode },
      }),
    ]);

    await appendEvent({
      type: EventType.PROPIEDAD_PROVISIONAL_PROMOVIDA,
      aggregateType: AggregateType.PROPERTY,
      aggregateId: inmovillaPropertyCode,
      payload: {
        draftId: draft.id,
        inmovillaId: inmovillaPropertyCode,
        linkedEntities: {
          visitWorkItems: await prisma.visitWorkItem.count({ where: { draftPropertyId: draft.id } }),
          notaEncargoSessions: await prisma.notaEncargoSession.count({ where: { draftPropertyId: draft.id } }),
        },
      },
      causationId: input.causationId,
      correlationId: input.correlationId,
    });

    return { inmovillaPropertyCode };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido al promover propiedad provisional";
    await markDraftPropertyFailed(draft.id, message, attempt, input.causationId, input.correlationId);
    throw error;
  }
}
