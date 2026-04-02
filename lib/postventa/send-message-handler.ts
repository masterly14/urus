import type { JobRecord } from "@/lib/job-queue/types";
import type { HandlerResult } from "@/lib/workers/consumer/types";
import { prisma } from "@/lib/prisma";
import { getPublicAppUrl } from "@/lib/microsite/app-url";
import {
  sendPostventaAgradecimiento,
  sendPostventaSoporte,
  sendPostventaResena,
  sendPostventaReferidos,
  sendPostventaRecaptacion,
} from "@/lib/whatsapp/send";

interface SendPostventaPayload {
  propertyCode: string;
  operacionId?: string;
  step: string;
  template: string;
  closedAt: string;
  requiresNoIncidencia: boolean;
}

function parsePayload(raw: unknown): SendPostventaPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (
    typeof p.propertyCode !== "string" ||
    typeof p.step !== "string" ||
    typeof p.template !== "string" ||
    typeof p.closedAt !== "string"
  ) {
    return null;
  }
  return {
    propertyCode: p.propertyCode,
    operacionId: typeof p.operacionId === "string" ? p.operacionId : undefined,
    step: p.step,
    template: p.template,
    closedAt: p.closedAt,
    requiresNoIncidencia: p.requiresNoIncidencia === true,
  };
}

interface BuyerInfo {
  phone: string;
  name: string;
}

/**
 * Obtiene datos del comprador buscando en LegalDocumentParty (role COMPRADOR),
 * con fallback a DemandCurrent vía eventos SELECCION_COMPRADOR.
 */
async function resolveBuyerInfo(propertyCode: string): Promise<BuyerInfo | null> {
  const party = await prisma.legalDocumentParty.findFirst({
    where: {
      role: "COMPRADOR",
      legalDocument: { propertyCode },
    },
    select: { phone: true, fullName: true },
    orderBy: { createdAt: "desc" },
  });

  if (party?.phone) {
    return { phone: party.phone, name: party.fullName };
  }

  const selectionEvent = await prisma.event.findFirst({
    where: {
      aggregateId: propertyCode,
      type: "SELECCION_COMPRADOR",
    },
    select: { payload: true },
    orderBy: { occurredAt: "desc" },
  });

  if (selectionEvent?.payload) {
    const ep = selectionEvent.payload as Record<string, unknown>;
    const demandId = typeof ep.demandId === "string" ? ep.demandId : null;
    if (demandId) {
      const demand = await prisma.demandCurrent.findUnique({
        where: { codigo: demandId },
        select: { telefono: true, nombre: true },
      });
      if (demand?.telefono) {
        return { phone: demand.telefono, name: demand.nombre };
      }
    }
  }

  return null;
}

async function resolveComercialInfo(propertyCode: string): Promise<{ name: string } | null> {
  const property = await prisma.propertyCurrent.findUnique({
    where: { codigo: propertyCode },
    select: { agente: true },
  });

  if (!property?.agente) return null;

  const comercial = await prisma.comercial.findFirst({
    where: { id: property.agente },
    select: { nombre: true },
  });

  return comercial ? { name: comercial.nombre } : { name: property.agente };
}

/**
 * Verifica si hay una incidencia post-venta abierta (sin resolver)
 * para la propiedad desde la fecha de cierre.
 */
export async function hasOpenIncidencia(
  propertyCode: string,
  closedAt: Date,
): Promise<boolean> {
  const abierta = await prisma.event.findFirst({
    where: {
      aggregateId: propertyCode,
      type: "INCIDENCIA_POSTVENTA_ABIERTA",
      occurredAt: { gt: closedAt },
    },
    orderBy: { occurredAt: "desc" },
  });

  if (!abierta) return false;

  const resuelta = await prisma.event.findFirst({
    where: {
      aggregateId: propertyCode,
      type: "INCIDENCIA_POSTVENTA_RESUELTA",
      occurredAt: { gt: abierta.occurredAt },
    },
  });

  return !resuelta;
}

type TemplateSender = (buyer: BuyerInfo, propertyCode: string, comercialName: string, operacionId?: string) => Promise<void>;

function buildTemplateSenders(): Record<string, TemplateSender> {
  const appUrl = getPublicAppUrl();
  const agencyName = process.env.AGENCY_NAME ?? "Urus Capital";
  const reviewUrl = process.env.GOOGLE_REVIEW_URL ?? "";

  return {
    agradecimiento: async (buyer, _pc, comercialName) => {
      await sendPostventaAgradecimiento(buyer.phone, {
        buyerName: buyer.name,
        agencyName,
        comercialName,
      });
    },
    soporte: async (buyer, propertyCode, _comercialName, operacionId) => {
      const guideUrl = `${appUrl}/postventa/guia`;
      await sendPostventaSoporte(buyer.phone, {
        buyerName: buyer.name,
        guideUrl,
        propertyCode: operacionId ?? propertyCode,
      });
    },
    resena: async (buyer) => {
      if (!reviewUrl) {
        console.warn("[postventa] GOOGLE_REVIEW_URL no configurada — omitiendo reseña");
        return;
      }
      await sendPostventaResena(buyer.phone, {
        buyerName: buyer.name,
        reviewUrl,
      });
    },
    referidos: async (buyer) => {
      const referralUrl = `${appUrl}/postventa/referidos`;
      await sendPostventaReferidos(buyer.phone, {
        buyerName: buyer.name,
        referralUrl,
      });
    },
    recaptacion: async (buyer, _pc, comercialName) => {
      const contactUrl = `${appUrl}/contacto`;
      await sendPostventaRecaptacion(buyer.phone, {
        buyerName: buyer.name,
        comercialName,
        contactUrl,
      });
    },
  };
}

/**
 * Job handler para SEND_POSTVENTA_MESSAGE.
 * Resuelve datos del comprador, verifica incidencias y envía el WhatsApp.
 */
export async function handleSendPostventaMessage(
  job: JobRecord,
): Promise<HandlerResult> {
  const payload = parsePayload(job.payload);
  if (!payload) {
    return {
      success: false,
      error: "SEND_POSTVENTA_MESSAGE: payload incompleto",
      permanent: true,
    };
  }

  const { propertyCode, operacionId, step, template, closedAt, requiresNoIncidencia } = payload;

  if (requiresNoIncidencia) {
    const paused = await hasOpenIncidencia(propertyCode, new Date(closedAt));
    if (paused) {
      console.log(
        `[postventa] SEND_POSTVENTA_MESSAGE ${step} para ${propertyCode} — pausado por incidencia abierta`,
      );
      return { success: true };
    }
  }

  const buyer = await resolveBuyerInfo(propertyCode);
  if (!buyer) {
    console.warn(
      `[postventa] SEND_POSTVENTA_MESSAGE ${step} para ${propertyCode} — sin datos de comprador`,
    );
    return { success: true };
  }

  const comercialInfo = await resolveComercialInfo(propertyCode);
  const comercialName = comercialInfo?.name ?? "tu agente";

  const senders = buildTemplateSenders();
  const sender = senders[template];

  if (!sender) {
    return {
      success: false,
      error: `SEND_POSTVENTA_MESSAGE: template "${template}" desconocido`,
      permanent: true,
    };
  }

  try {
    await sender(buyer, propertyCode, comercialName, operacionId);
    console.log(
      `[postventa] SEND_POSTVENTA_MESSAGE ${step} para ${propertyCode}${operacionId ? ` (operacion=${operacionId})` : ""} — enviado a ${buyer.phone}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[postventa] SEND_POSTVENTA_MESSAGE ${step} para ${propertyCode} — error: ${message}`,
    );
    return { success: false, error: message };
  }

  return { success: true };
}
