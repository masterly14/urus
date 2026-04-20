import type { JobRecord } from "@/lib/job-queue/types";
import type { HandlerResult } from "@/lib/workers/consumer/types";
import { prisma } from "@/lib/prisma";
import { enqueueJob } from "@/lib/job-queue";
import { resolveComercialByProperty } from "@/lib/routing/resolve-comercial";
import { getPublicAppUrl } from "@/lib/microsite/app-url";
import { sendPostventaFormulario } from "@/lib/postventa/whatsapp";
import { getBuyerInfoForProperty } from "@/lib/postventa/resolve-buyer";
import {
  sendPostventaAgradecimiento,
  sendPostventaResena,
  sendPostventaReferidos,
  sendPostventaRecaptacion,
  sendPostventaCumpleanos,
  sendPostventaNavidad,
} from "@/lib/whatsapp/send";
import {
  localYear,
  postventaTimezone,
  postventaBirthdayHourLocal,
  postventaNavidadDay,
  postventaNavidadMonth,
  postventaNavidadHourLocal,
  localDateTimeToUtc,
  nextAnnualOccurrenceUtc,
} from "./anniversary-schedule";

interface SendPostventaPayload {
  propertyCode: string;
  operacionId?: string;
  step: string;
  template: string;
  closedAt: string;
  requiresNoIncidencia: boolean;
  sessionId?: string;
  year?: number;
  birthDate?: string;
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
    sessionId: typeof p.sessionId === "string" ? p.sessionId : undefined,
    year: typeof p.year === "number" ? p.year : undefined,
    birthDate: typeof p.birthDate === "string" ? p.birthDate : undefined,
  };
}

interface BuyerInfo {
  phone: string;
  name: string;
}

async function resolveComercialInfo(
  propertyCode: string,
): Promise<{ name: string } | null> {
  const comercial = await resolveComercialByProperty(propertyCode);
  if (!comercial) return null;
  return { name: comercial.nombre };
}

/**
 * Verifica si hay una incidencia post-venta abierta (sin resolver) para la
 * propiedad desde la fecha de cierre.
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

type TemplateSender = (args: {
  buyer: BuyerInfo;
  propertyCode: string;
  comercialName: string;
  operacionId?: string;
  sessionId?: string;
}) => Promise<void>;

function buildTemplateSenders(): Record<string, TemplateSender> {
  const appUrl = getPublicAppUrl();
  const agencyName = process.env.AGENCY_NAME ?? "Urus Capital";
  const reviewUrl = process.env.GOOGLE_REVIEW_URL ?? "";

  return {
    agradecimiento: async ({ buyer, comercialName }) => {
      await sendPostventaAgradecimiento(
        buyer.phone,
        {
          buyerName: buyer.name,
          agencyName,
          comercialName,
        },
        { useTemplate: true },
      );
    },
    formulario: async ({ buyer, propertyCode, operacionId, sessionId }) => {
      if (!sessionId) {
        throw new Error(
          `template "formulario" requiere sessionId en el payload (propertyCode=${propertyCode})`,
        );
      }
      const operationRef = operacionId
        ? await resolveOperationRef(operacionId, propertyCode)
        : propertyCode;
      await sendPostventaFormulario(buyer.phone, {
        sessionId,
        buyerName: buyer.name || "cliente",
        operationRef,
      });
    },
    resena: async ({ buyer }) => {
      if (!reviewUrl) {
        console.warn(
          "[postventa] GOOGLE_REVIEW_URL no configurada — omitiendo reseña",
        );
        return;
      }
      await sendPostventaResena(
        buyer.phone,
        { buyerName: buyer.name, reviewUrl },
        { useTemplate: true },
      );
    },
    referidos: async ({ buyer }) => {
      const referralUrl = `${appUrl}/postventa/referidos`;
      await sendPostventaReferidos(
        buyer.phone,
        { buyerName: buyer.name, referralUrl },
        { useTemplate: true },
      );
    },
    recaptacion: async ({ buyer, comercialName }) => {
      const contactUrl = `${appUrl}/contacto`;
      await sendPostventaRecaptacion(
        buyer.phone,
        { buyerName: buyer.name, comercialName, contactUrl },
        { useTemplate: true },
      );
    },
    cumple: async ({ buyer }) => {
      await sendPostventaCumpleanos(buyer.phone, {
        buyerName: buyer.name || "cliente",
        agencyName,
      });
    },
    navidad: async ({ buyer }) => {
      await sendPostventaNavidad(buyer.phone, {
        buyerName: buyer.name || "cliente",
        agencyName,
      });
    },
  };
}

async function resolveOperationRef(
  operacionId: string,
  propertyCode: string,
): Promise<string> {
  const op = await prisma.operacion.findUnique({
    where: { id: operacionId },
    select: { codigo: true },
  });
  return op?.codigo ?? propertyCode;
}

/**
 * Tras enviar un mensaje anual (`cumple` / `navidad`), encola el del año
 * siguiente con idempotencyKey basada en el año natural. Diseñado para ser
 * idempotente y re-entrante.
 */
async function reScheduleAnnualIfNeeded(
  template: string,
  payload: SendPostventaPayload,
): Promise<void> {
  if (!payload.operacionId) return;
  const tz = postventaTimezone();
  const currentYear = payload.year ?? localYear(new Date(), tz);
  const nextYear = currentYear + 1;

  if (template === "cumple") {
    if (!payload.birthDate) return;
    const birth = new Date(payload.birthDate);
    if (Number.isNaN(birth.getTime())) return;
    const nextDate = localDateTimeToUtc(
      nextYear,
      birth.getUTCMonth(),
      birth.getUTCDate(),
      postventaBirthdayHourLocal(),
      tz,
    );
    await enqueueJob({
      type: "SEND_POSTVENTA_MESSAGE",
      payload: {
        ...payload,
        step: `BIRTHDAY_${nextYear}`,
        template: "cumple",
        year: nextYear,
      },
      availableAt: nextDate,
      idempotencyKey: `postventa:cumple:${payload.operacionId}:${nextYear}`,
    });
    console.log(
      `[postventa:send] reagendado cumpleaños ${nextYear} para operacionId=${payload.operacionId} en ${nextDate.toISOString()}`,
    );
    return;
  }

  if (template === "navidad") {
    const nextDate = nextAnnualOccurrenceUtc({
      monthIndex: postventaNavidadMonth() - 1,
      day: postventaNavidadDay(),
      hourLocal: postventaNavidadHourLocal(),
      timezone: tz,
      now: new Date(Date.UTC(nextYear, 0, 1)),
    });
    await enqueueJob({
      type: "SEND_POSTVENTA_MESSAGE",
      payload: {
        ...payload,
        step: `NAVIDAD_${nextYear}`,
        template: "navidad",
        year: nextYear,
      },
      availableAt: nextDate,
      idempotencyKey: `postventa:navidad:${payload.operacionId}:${nextYear}`,
    });
    console.log(
      `[postventa:send] reagendada navidad ${nextYear} para operacionId=${payload.operacionId} en ${nextDate.toISOString()}`,
    );
  }
}

/**
 * Job handler para `SEND_POSTVENTA_MESSAGE`.
 * - Resuelve datos del comprador
 * - Verifica incidencias si aplica
 * - Envía SIEMPRE vía plantilla Meta (`useTemplate: true`)
 * - Si es anual (cumple/navidad), reagenda el siguiente año al completar
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

  const {
    propertyCode,
    operacionId,
    step,
    template,
    closedAt,
    requiresNoIncidencia,
    sessionId,
  } = payload;

  if (template === "soporte") {
    console.warn(
      `[postventa] SEND_POSTVENTA_MESSAGE ${step} template=soporte deprecado — omitiendo (job antiguo en cola)`,
    );
    return { success: true };
  }

  if (requiresNoIncidencia) {
    const paused = await hasOpenIncidencia(propertyCode, new Date(closedAt));
    if (paused) {
      console.log(
        `[postventa] SEND_POSTVENTA_MESSAGE ${step} para ${propertyCode} — pausado por incidencia abierta`,
      );
      return { success: true };
    }
  }

  // Preferimos `buyerName` almacenado en la `PostventaSurveySession` si
  // existe (más fiable que `LegalDocumentParty` en leads puramente digitales).
  let buyer = await getBuyerInfoForProperty(propertyCode);
  if (operacionId) {
    const session = await prisma.postventaSurveySession.findUnique({
      where: { operacionId },
      select: { buyerPhone: true, buyerName: true },
    });
    if (session?.buyerPhone) {
      buyer = {
        phone: session.buyerPhone,
        name: session.buyerName || buyer?.name || "",
      };
    }
  }

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
    await sender({
      buyer,
      propertyCode,
      comercialName,
      operacionId,
      sessionId,
    });
    console.log(
      `[postventa] SEND_POSTVENTA_MESSAGE ${step} para ${propertyCode}${operacionId ? ` (operacion=${operacionId})` : ""} — plantilla enviada a ${buyer.phone}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[postventa] SEND_POSTVENTA_MESSAGE ${step} para ${propertyCode} — error: ${message}`,
    );
    return { success: false, error: message };
  }

  if (template === "cumple" || template === "navidad") {
    try {
      await reScheduleAnnualIfNeeded(template, payload);
    } catch (err) {
      console.error(
        `[postventa] reScheduleAnnualIfNeeded falló para operacionId=${operacionId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { success: true };
}
