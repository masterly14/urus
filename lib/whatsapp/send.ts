/**
 * Funciones de envío de alto nivel para WhatsApp Cloud API (Meta).
 * Capa de abstracción sobre createWhatsAppClient para los casos de uso del sistema.
 */

import { createWhatsAppClient } from "./client";
import { appendEvent } from "@/lib/event-store";
import { prisma } from "@/lib/prisma";
import { normalizeWhatsAppDigits } from "@/lib/microsite/buyer-phone";
import type { JsonValue } from "@/lib/event-store";
import type {
  WhatsAppClientConfig,
  TemplateObject,
  InteractiveObject,
  DocumentObject,
  ImageObject,
  SendMessageSuccess,
} from "./types";

export type WhatsAppTraceOptions = {
  source: string;
  kind?: string;
  aggregateId?: string;
  correlationId?: string | null;
  causationId?: string | null;
  metadata?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  /**
   * Si `true`, no se registra el evento `WHATSAPP_ENVIADO` en el Event Store.
   * Solo lo usan flujos internos que no deben aparecer en "Conversaciones"
   * (por defecto siempre se registra, incluso sin `trace`, para que cualquier
   * mensaje enviado a un comercial o comprador sea trazable en la UI).
   */
  disabled?: boolean;
};

type SendOptions = Partial<WhatsAppClientConfig> & {
  /** WAMID del mensaje previo (para replies contextualizados). */
  contextMessageId?: string;
  /** Registro explicito en Event Store para trazabilidad comercial. */
  trace?: WhatsAppTraceOptions;
};

/** Código de idioma de plantillas Meta; debe coincidir con la traducción aprobada (p. ej. `es` o `es_ES`). */
const WHATSAPP_TEMPLATE_LANGUAGE_CODE =
  process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "es";

function isEnvDisabled(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "0" || normalized === "false" || normalized === "no";
}

export function shouldSendWhatsAppToCommercials(): boolean {
  return !isEnvDisabled(process.env.WHATSAPP_COMMERCIAL_NOTIFICATIONS_ENABLED);
}

function skippedCommercialSend(to: string, context: string): SendMessageSuccess {
  console.log(
    `[whatsapp] envío a comercial desactivado por WHATSAPP_COMMERCIAL_NOTIFICATIONS_ENABLED (${context}) → to=${to}`,
  );
  return {
    messages: [{ id: `wamid.skipped_commercial_${Date.now()}` }],
  } as SendMessageSuccess;
}

/**
 * Registry of all WhatsApp template names used in this codebase.
 * Each must exist in Meta Business Manager with the exact number of variables
 * specified in the comment. Deploy checklist: verify all templates are approved
 * before sending business-initiated messages.
 */
export const WHATSAPP_TEMPLATES = {
  MATCH: process.env.WHATSAPP_TEMPLATE_MATCH ?? "match", // body: 2 vars (nombre, enlace)
  LEAD_ASIGNADO: process.env.WHATSAPP_TEMPLATE_LEAD_ASIGNADO ?? "lead_asignado",     // body: 3 vars (leadId, score, slaLevel)
  LEAD_FOLLOW_UP: "lead_follow_up",                                  // body: 3 vars (leadId, step, score)
  CONTRATO_FIRMA_ENVIADA: process.env.WHATSAPP_TEMPLATE_CONTRATO_FIRMA_ENVIADA ?? "contrato_firma_enviada",     // body: 4 vars
  CONTRATO_FIRMA_RECORDATORIO_D1: process.env.WHATSAPP_TEMPLATE_CONTRATO_FIRMA_D1 ?? "contrato_firma_recordatorio_d1", // body: 4 vars
  CONTRATO_FIRMA_RECORDATORIO_D3: process.env.WHATSAPP_TEMPLATE_CONTRATO_FIRMA_D3 ?? "contrato_firma_recordatorio_d3", // body: 4 vars
  CONTRATO_FIRMA_RECORDATORIO_D5: process.env.WHATSAPP_TEMPLATE_CONTRATO_FIRMA_D5 ?? "contrato_firma_recordatorio_d5", // body: 4 vars
  CONTRATO_FIRMA_SLA_ESCALADO: process.env.WHATSAPP_TEMPLATE_CONTRATO_FIRMA_SLA_ESCALADO ?? "contrato_firma_sla_escalado", // body: 3 vars
  PRICING_INFORME: process.env.WHATSAPP_TEMPLATE_PRICING_INFORME ?? "pricing_informe_listo",           // body: 6 vars (nombre, ref, dirección, semáforo, gap, URL)
  POSTVENTA_AGRADECIMIENTO: process.env.WHATSAPP_TEMPLATE_POSTVENTA_AGRADECIMIENTO ?? "postventa_agradecimiento", // body: 3 vars
  POSTVENTA_RESENA: process.env.WHATSAPP_TEMPLATE_POSTVENTA_RESENA ?? "postventa_resena",             // body: 2 vars
  POSTVENTA_REFERIDOS: process.env.WHATSAPP_TEMPLATE_POSTVENTA_REFERIDOS ?? "postventa_referidos",       // body: 2 vars
  POSTVENTA_RECAPTACION: process.env.WHATSAPP_TEMPLATE_POSTVENTA_RECAPTACION ?? "postventa_recaptacion",   // body: 3 vars
  POSTVENTA_CUMPLEANOS: process.env.WHATSAPP_TEMPLATE_POSTVENTA_CUMPLEANOS ?? "postventa_cumpleanos",     // body: 2 vars
  POSTVENTA_NAVIDAD: process.env.WHATSAPP_TEMPLATE_POSTVENTA_NAVIDAD ?? "postventa_navidad",           // body: 2 vars
  DEV_EJERCICIO: process.env.WHATSAPP_TEMPLATE_DEV_EXERCISE ?? "dev_ejercicio_diario",               // body: 3 vars
  VISITA_PAQUETE_COMERCIAL: process.env.WHATSAPP_TEMPLATE_VISITA_PAQUETE_COMERCIAL ?? "visita_paquete_comercial", // body: 4 vars (demanda, comprador, propiedades, acción)
  FOLLOW_UP_DEMANDA: process.env.WHATSAPP_TEMPLATE_FOLLOW_UP_DEMANDA ?? "follow_up_demanda", // body: 4 vars (comercial, demanda, propiedad, teléfono demanda)
  NLU_DEMANDA_CONTACTO_INICIAL: process.env.WHATSAPP_TEMPLATE_NLU_DEMANDA_CONTACTO_INICIAL ?? "nlu_demanda_contacto_inicial", // body: 2 vars (nombre, mensaje)
  MICROSITE_LISTO_COMPRADOR: process.env.WHATSAPP_TEMPLATE_MICROSITE_LISTO_COMPRADOR ?? "microsite_listo_comprador", // body: 2 vars (nombre comprador, URL del micrositio)
  MICROSITE_PROPIEDAD_ME_ENCAJA: process.env.WHATSAPP_TEMPLATE_MICROSITE_PROPIEDAD_ME_ENCAJA ?? "microsite_propiedad_me_encaja", // body: 2 vars (nombre comprador, título de la propiedad)
} as const;

// ---------------------------------------------------------------------------
// Test interceptor — permite capturar mensajes salientes sin enviar a Meta.
// En producción _testSendInterceptor es siempre null (coste cero).
// ---------------------------------------------------------------------------

export type TestSendInterceptor = (msg: {
  to: string;
  type: "text" | "template" | "interactive";
  payload: unknown;
}) => void;

let _testSendInterceptor: TestSendInterceptor | null = null;

export function setTestSendInterceptor(fn: TestSendInterceptor | null) {
  _testSendInterceptor = fn;
}

function testId(): string {
  return `wamid.test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function resultMessageId(result: SendMessageSuccess): string | null {
  return result.messages[0]?.id ?? null;
}

function resultWaId(result: SendMessageSuccess, fallback: string): string {
  return result.contacts?.[0]?.wa_id ?? fallback;
}

/**
 * Registra `WHATSAPP_ENVIADO` en el Event Store para que el mensaje aparezca
 * en la UI de "Conversaciones".
 *
 * Política:
 * - Si `trace.disabled === true` → no se registra (uso interno).
 * - Si hay `_testSendInterceptor` activo y NO se pasó `trace` → no se registra.
 *   Los unit tests que sólo verifican payload via interceptor (p. ej.
 *   `send-no-stock.unit.test.ts`) no tienen Prisma mockeado.
 * - En cualquier otro caso → se registra, usando defaults razonables cuando
 *   no se pasa `trace` (source="whatsapp_send", kind=messageType).
 *
 * Esto asegura que cualquier WhatsApp enviado (al comercial, al comprador,
 * por scripts, por crons, etc.) sea trazable end-to-end en "Conversaciones",
 * sin obligar a cada call site a propagar un `trace` explícito.
 */
async function recordSentMessage(params: {
  to: string;
  result: SendMessageSuccess;
  messageType: "text" | "template" | "interactive" | "document" | "image";
  content: Record<string, unknown>;
  options?: SendOptions;
}) {
  const trace = params.options?.trace;
  if (trace?.disabled) return;
  if (_testSendInterceptor && !trace) return;

  const source = trace?.source ?? "whatsapp_send";
  const kind = trace?.kind ?? params.messageType;
  const messageId = resultMessageId(params.result);
  const fallbackWaId = resultWaId(params.result, params.to);
  const waId =
    trace?.aggregateId ||
    normalizeWhatsAppDigits(params.to) ||
    normalizeWhatsAppDigits(fallbackWaId) ||
    params.to;

  try {
    if (messageId) {
      const existing = await prisma.event.findFirst({
        where: {
          type: "WHATSAPP_ENVIADO",
          aggregateType: "WHATSAPP_CONVERSATION",
          aggregateId: waId,
          payload: { path: ["messageId"], equals: messageId },
        },
        select: { id: true },
      });
      if (existing) return;
    }

    await appendEvent({
      type: "WHATSAPP_ENVIADO",
      aggregateType: "WHATSAPP_CONVERSATION",
      aggregateId: waId,
      payload: {
        messageId,
        to: params.to,
        waId,
        messageType: params.messageType,
        source,
        kind,
        contextMessageId: params.options?.contextMessageId ?? null,
        ...params.content,
        ...(trace?.payload ?? {}),
      } as JsonValue,
      metadata: {
        source,
        ...(trace?.metadata ?? {}),
      } as JsonValue,
      correlationId: trace?.correlationId ?? undefined,
      causationId: trace?.causationId ?? undefined,
    });
  } catch (err) {
    console.error(
      `[whatsapp] no se pudo registrar WHATSAPP_ENVIADO source=${source} to=${params.to}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Envía un mensaje de texto libre.
 * Solo válido dentro de una ventana de 24h de conversación iniciada por el usuario.
 */
export async function sendTextMessage(
  to: string,
  body: string,
  options?: SendOptions & { previewUrl?: boolean },
): Promise<SendMessageSuccess> {
  if (_testSendInterceptor) {
    _testSendInterceptor({ to, type: "text", payload: { body } });
    const result = { messages: [{ id: testId() }] } as SendMessageSuccess;
    await recordSentMessage({
      to,
      result,
      messageType: "text",
      content: { body, text: { body, preview_url: options?.previewUrl ?? false } },
      options,
    });
    return result;
  }
  const client = createWhatsAppClient(options);
  const result = await client.sendMessage({
    to,
    type: "text",
    text: { body, preview_url: options?.previewUrl ?? false },
    ...(options?.contextMessageId
      ? { context: { message_id: options.contextMessageId } }
      : {}),
  });
  await recordSentMessage({
    to,
    result,
    messageType: "text",
    content: { body, text: { body, preview_url: options?.previewUrl ?? false } },
    options,
  });
  return result;
}

/**
 * Envía un mensaje usando una plantilla aprobada en Meta.
 * Obligatorio para mensajes business-initiated (fuera de ventana de 24h).
 */
export async function sendTemplateMessage(
  to: string,
  template: TemplateObject,
  options?: SendOptions,
): Promise<SendMessageSuccess> {
  if (_testSendInterceptor) {
    _testSendInterceptor({ to, type: "template", payload: template });
    const result = { messages: [{ id: testId() }] } as SendMessageSuccess;
    await recordSentMessage({
      to,
      result,
      messageType: "template",
      content: { template },
      options,
    });
    return result;
  }
  const client = createWhatsAppClient(options);
  const result = await client.sendMessage({
    to,
    type: "template",
    template,
    ...(options?.contextMessageId
      ? { context: { message_id: options.contextMessageId } }
      : {}),
  });
  await recordSentMessage({
    to,
    result,
    messageType: "template",
    content: { template },
    options,
  });
  return result;
}

/**
 * Envía un documento (PDF, imagen, etc.) como mensaje de WhatsApp.
 * Solo válido dentro de una ventana de 24h de conversación activa.
 * Ideal para entregar documentos firmados directamente al usuario.
 */
export async function sendDocumentMessage(
  to: string,
  document: DocumentObject,
  options?: SendOptions,
): Promise<SendMessageSuccess> {
  if (_testSendInterceptor) {
    _testSendInterceptor({ to, type: "text", payload: { document } });
    const result = { messages: [{ id: testId() }] } as SendMessageSuccess;
    await recordSentMessage({
      to,
      result,
      messageType: "document",
      content: { document },
      options,
    });
    return result;
  }
  const client = createWhatsAppClient(options);
  const result = await client.sendMessage({
    to,
    type: "document",
    document,
    ...(options?.contextMessageId
      ? { context: { message_id: options.contextMessageId } }
      : {}),
  });
  await recordSentMessage({
    to,
    result,
    messageType: "document",
    content: { document },
    options,
  });
  return result;
}

/**
 * Envía una imagen por URL pública HTTPS (Cloud API).
 * Solo válido dentro de una ventana de 24h de conversación activa.
 */
export async function sendImageMessage(
  to: string,
  image: ImageObject,
  options?: SendOptions,
): Promise<SendMessageSuccess> {
  if (_testSendInterceptor) {
    _testSendInterceptor({ to, type: "text", payload: { image } });
    const result = { messages: [{ id: testId() }] } as SendMessageSuccess;
    await recordSentMessage({
      to,
      result,
      messageType: "image",
      content: { image },
      options,
    });
    return result;
  }
  const client = createWhatsAppClient(options);
  const result = await client.sendMessage({
    to,
    type: "image",
    image: {
      link: image.link,
      ...(image.caption ? { caption: image.caption } : {}),
    },
    ...(options?.contextMessageId
      ? { context: { message_id: options.contextMessageId } }
      : {}),
  });
  await recordSentMessage({
    to,
    result,
    messageType: "image",
    content: { image },
    options,
  });
  return result;
}

/**
 * Envía un mensaje interactivo con botones de respuesta rápida (reply buttons)
 * o lista de opciones. Requiere ventana de conversación activa.
 */
export async function sendInteractiveMessage(  to: string,
  interactive: InteractiveObject,
  options?: SendOptions,
): Promise<SendMessageSuccess> {
  if (_testSendInterceptor) {
    _testSendInterceptor({ to, type: "interactive", payload: interactive });
    const result = { messages: [{ id: testId() }] } as SendMessageSuccess;
    await recordSentMessage({
      to,
      result,
      messageType: "interactive",
      content: { interactive },
      options,
    });
    return result;
  }
  const client = createWhatsAppClient(options);
  const result = await client.sendMessage({
    to,
    type: "interactive",
    interactive,
    ...(options?.contextMessageId
      ? { context: { message_id: options.contextMessageId } }
      : {}),
  });
  await recordSentMessage({
    to,
    result,
    messageType: "interactive",
    content: { interactive },
    options,
  });
  return result;
}

/**
 * Helper: envía la plantilla de match de propiedad estándar del sistema.
 * Template esperado: "match" (override: WHATSAPP_TEMPLATE_MATCH) con variables {{1}}=nombre, {{2}}=enlace.
 * Requiere que la plantilla esté aprobada en Meta Business Manager.
 */
export async function sendMatchNotification(
  to: string,
  params: { nombre: string; enlacePropiedad: string },
  options?: SendOptions,
): Promise<SendMessageSuccess> {
  const template: TemplateObject = {
    name: WHATSAPP_TEMPLATES.MATCH,
    language: { code: WHATSAPP_TEMPLATE_LANGUAGE_CODE },
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: params.nombre },
          { type: "text", text: params.enlacePropiedad },
        ],
      },
    ],
  };
  return sendTemplateMessage(to, template, options);
}

export interface LeadAssignedParams {
  leadId: string;
  score: number;
  slaLevel: string;
  maxResponseMs?: number;
  ciudad?: string;
  reasons?: string[];
}

const LEAD_ASSIGNED_TEMPLATE =
  process.env.WHATSAPP_TEMPLATE_LEAD_ASIGNADO ?? "lead_asignado";

/**
 * Notifica al comercial que tiene un nuevo lead asignado.
 * Siempre usa plantilla Meta (business-initiated, fuera de ventana 24h).
 * Requiere plantilla "lead_asignado" aprobada en Meta Business Manager
 * con 3 variables: {{1}}=leadId, {{2}}=score, {{3}}=slaLevel.
 */
export async function sendLeadAssignedToCommercial(
  to: string,
  params: LeadAssignedParams,
  options?: SendOptions,
): Promise<SendMessageSuccess> {
  if (!shouldSendWhatsAppToCommercials()) {
    return skippedCommercialSend(to, "sendLeadAssignedToCommercial");
  }
  const template: TemplateObject = {
    name: LEAD_ASSIGNED_TEMPLATE,
    language: { code: WHATSAPP_TEMPLATE_LANGUAGE_CODE },
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: params.leadId },
          { type: "text", text: String(params.score) },
          { type: "text", text: params.slaLevel },
        ],
      },
    ],
  };
  return sendTemplateMessage(to, template, options);
}

export interface FollowUpParams {
  leadId: string;
  step: string;
  score: number;
  daysSinceCreation?: number;
}

export interface FollowUpDemandaParams {
  comercialName: string;
  demandName: string;
  propertyName: string;
  demandPhone: string;
}

const STEP_LABELS: Record<string, string> = {
  "D+1": "1 día sin contacto",
  "D+3": "3 días sin contacto",
  "D+7": "7 días sin contacto — última alerta",
};

/**
 * Envía recordatorio de follow-up al comercial para un lead sin respuesta.
 * MVP: texto libre. Producción: plantilla "lead_follow_up".
 */
export async function sendFollowUpToCommercial(
  to: string,
  params: FollowUpParams,
  options?: SendOptions & { useTemplate?: boolean },
): Promise<SendMessageSuccess> {
  if (!shouldSendWhatsAppToCommercials()) {
    return skippedCommercialSend(to, "sendFollowUpToCommercial");
  }
  if (options?.useTemplate) {
    const template: TemplateObject = {
      name: "lead_follow_up",
      language: { code: WHATSAPP_TEMPLATE_LANGUAGE_CODE },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: params.leadId },
            { type: "text", text: params.step },
            { type: "text", text: String(params.score) },
          ],
        },
      ],
    };
    return sendTemplateMessage(to, template, options);
  }

  const stepLabel = STEP_LABELS[params.step] ?? params.step;
  const urgencyEmoji = params.step === "D+7" ? "🔴" : params.step === "D+3" ? "🟡" : "🟢";

  const lines = [
    `${urgencyEmoji} *Recordatorio: lead sin contactar*`,
    ``,
    `• Lead: ${params.leadId}`,
    `• Estado: ${stepLabel}`,
    `• Score original: ${params.score}/100`,
  ];

  if (params.step === "D+7") {
    lines.push(
      ``,
      `⚠️ Este es el último recordatorio automático.`,
      `Si no se contacta, el lead pasará a estado inactivo.`,
    );
  }

  lines.push(``, `Contacta al lead lo antes posible.`);

  return sendTextMessage(to, lines.join("\n"), options);
}

/**
 * Envía al comercial el recordatorio post-visita para seguimiento de demanda.
 * Plantilla Meta requerida: "follow_up_demanda" (4 variables).
 */
export async function sendFollowUpDemandaToCommercial(
  to: string,
  params: FollowUpDemandaParams,
  options?: SendOptions,
): Promise<SendMessageSuccess> {
  if (!shouldSendWhatsAppToCommercials()) {
    return skippedCommercialSend(to, "sendFollowUpDemandaToCommercial");
  }

  const template: TemplateObject = {
    name: WHATSAPP_TEMPLATES.FOLLOW_UP_DEMANDA,
    language: { code: WHATSAPP_TEMPLATE_LANGUAGE_CODE },
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: params.comercialName },
          { type: "text", text: params.demandName },
          { type: "text", text: params.propertyName },
          { type: "text", text: params.demandPhone },
        ],
      },
    ],
  };

  return sendTemplateMessage(to, template, options);
}

export type MicrositeValidationNotifyParams = {
  demandNombre: string;
  demandId: string;
  validationUrl: string;
  /** Fecha límite ISO para el SLA (2h). */
  validationDueAtIso: string;
};

/**
 * Notifica al comercial que debe validar la selección de propiedades del microsite (M6).
 * MVP: texto libre (ventana 24h con el comercial).
 */
export async function sendMicrositePendingValidationToCommercial(
  to: string,
  params: MicrositeValidationNotifyParams,
  options?: SendOptions,
): Promise<SendMessageSuccess> {
  if (!shouldSendWhatsAppToCommercials()) {
    return skippedCommercialSend(to, "sendMicrositePendingValidationToCommercial");
  }
  const due = new Date(params.validationDueAtIso);
  const dueStr = due.toLocaleString("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  });
  const lines = [
    `🏠 *Selección de mercado lista*`,
    ``,
    `• Demanda: ${params.demandNombre || params.demandId}`,
    `• ID: ${params.demandId}`,
    ``,
    `Valida en menos de 2h (antes de ${dueStr}):`,
    params.validationUrl,
    ``,
    `Tras aprobar, enviaremos el enlace al comprador por WhatsApp.`,
  ];
  return sendTextMessage(to, lines.join("\n"), options);
}

export type MicrositeBuyerLinkParams = {
  demandNombre: string;
  buyerUrl: string;
};

/**
 * Envía al comprador el enlace público del microsite tras validación comercial.
 *
 * Plantilla Meta requerida: `microsite_listo_comprador` (UTILITY, 2 variables):
 *   {{1}} = nombre del comprador, {{2}} = URL completa del micrositio.
 *
 * Se usa plantilla porque al validar la selección puede haber pasado más de 24h
 * desde el último mensaje del comprador (fuera de la ventana de servicio).
 */
export async function sendMicrositeLinkToBuyer(
  to: string,
  params: MicrositeBuyerLinkParams,
  options?: SendOptions,
): Promise<SendMessageSuccess> {
  const firstName = params.demandNombre.trim().split(/\s+/)[0] || params.demandNombre.trim();
  const template: TemplateObject = {
    name: WHATSAPP_TEMPLATES.MICROSITE_LISTO_COMPRADOR,
    language: { code: WHATSAPP_TEMPLATE_LANGUAGE_CODE },
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: firstName },
          { type: "text", text: params.buyerUrl },
        ],
      },
    ],
  };
  return sendTemplateMessage(to, template, options);
}

export type BuyerInterestAckParams = {
  buyerName: string;
  propertyTitle: string;
};

/**
 * Acuse al comprador tras pulsar "Me encaja" en una propiedad del micrositio.
 *
 * Plantilla Meta requerida: `microsite_propiedad_me_encaja` (UTILITY, 2 variables):
 *   {{1}} = nombre del comprador, {{2}} = título curado de la propiedad.
 *
 * La dedup por `selectionId+propertyId` se hace en el job handler
 * (`SEND_BUYER_INTEREST_ACK`), no aquí, para mantener esta función como
 * primitiva de envío reutilizable.
 */
export async function sendBuyerInterestAckToBuyer(
  to: string,
  params: BuyerInterestAckParams,
  options?: SendOptions,
): Promise<SendMessageSuccess> {
  const firstName = params.buyerName.trim().split(/\s+/)[0] || params.buyerName.trim();
  const template: TemplateObject = {
    name: WHATSAPP_TEMPLATES.MICROSITE_PROPIEDAD_ME_ENCAJA,
    language: { code: WHATSAPP_TEMPLATE_LANGUAGE_CODE },
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: firstName },
          { type: "text", text: params.propertyTitle },
        ],
      },
    ],
  };
  return sendTemplateMessage(to, template, options);
}

export type NoStockAvailableToBuyerParams = {
  demandNombre: string;
  /**
   * URL de la última selección aprobada que el comprador ya tiene. Si no existe
   * (es su primer microsite), se omite la sección de "revisa las actuales".
   */
  currentSelectionUrl?: string | null;
};

/**
 * Aviso al comprador cuando no se han encontrado propiedades nuevas que
 * encajen con los criterios actuales. Si tenía una selección previa, se le
 * invita a revisarla; si no, se le invita a ajustar los criterios.
 */
export async function sendNoStockAvailableToBuyer(
  to: string,
  params: NoStockAvailableToBuyerParams,
  options?: SendOptions,
): Promise<SendMessageSuccess> {
  const firstName = params.demandNombre.trim().split(/\s+/)[0];
  const greeting = `Hola${firstName ? ` ${firstName}` : ""},`;

  const lines: string[] = [greeting, ``];

  if (params.currentSelectionUrl) {
    lines.push(
      `De momento no he encontrado opciones nuevas que encajen con los criterios que me has dado, así que todavía no tengo alternativas que mandarte.`,
      ``,
      `Mientras tanto, si quieres échale un vistazo de nuevo a la selección que ya tienes, por si alguna te encaja mejor ahora:`,
      params.currentSelectionUrl,
      ``,
      `Si prefieres que busque con otros criterios (presupuesto, zona, metros, habitaciones…), dímelo por aquí y ajusto la búsqueda.`,
    );
  } else {
    lines.push(
      `De momento no he encontrado propiedades que encajen con los criterios que me has dado.`,
      ``,
      `Si quieres, dime por aquí con qué margen podemos movernos (presupuesto, zona, metros, habitaciones…) y vuelvo a buscar.`,
    );
  }

  return sendTextMessage(to, lines.join("\n"), { ...options, previewUrl: true });
}

export type ContractDataIncompleteNotifyParams = {
  operationId: string;
  demandId: string;
  missingCategories: string[];
  description: string;
};

/**
 * Notifica al comercial que faltan datos obligatorios para generar un contrato (M8).
 * MVP: texto libre (ventana 24h). Producción: plantilla "contrato_datos_incompletos".
 */
export async function sendContractDataIncompleteToCommercial(
  to: string,
  params: ContractDataIncompleteNotifyParams,
  options?: SendOptions,
): Promise<SendMessageSuccess> {
  if (!shouldSendWhatsAppToCommercials()) {
    return skippedCommercialSend(to, "sendContractDataIncompleteToCommercial");
  }
  const categoriesLabel = params.missingCategories.length > 0
    ? params.missingCategories.join(", ")
    : "campos obligatorios";

  const lines = [
    `📄 *Contrato: datos incompletos*`,
    ``,
    `• Operación: ${params.operationId}`,
    `• Demanda: ${params.demandId}`,
    `• Datos faltantes: ${categoriesLabel}`,
    ``,
    params.description,
    ``,
    `Completa los datos en Inmovilla para que el sistema pueda generar el contrato.`,
  ];

  return sendTextMessage(to, lines.join("\n"), options);
}

export type MicrositeValidationEscalationParams = {
  demandId: string;
  demandNombre: string;
  validationUrl: string;
  validationDueAtIso: string;
};

/** Alerta a jefe de zona / escalación si se incumple el SLA de validación. */
export async function sendMicrositeValidationEscalation(
  to: string,
  params: MicrositeValidationEscalationParams,
  options?: SendOptions,
): Promise<SendMessageSuccess> {
  const lines = [
    `⚠️ *SLA validación microsite incumplido*`,
    ``,
    `• Demanda: ${params.demandNombre || params.demandId}`,
    `• ID: ${params.demandId}`,
    `• Límite: ${params.validationDueAtIso}`,
    ``,
    `Pendiente de validación comercial:`,
    params.validationUrl,
  ];
  return sendTextMessage(to, lines.join("\n"), options);
}

// ---------------------------------------------------------------------------
// Post-Venta (M9) — cadencia de mensajes al cliente tras cierre (MVP simple)
// ---------------------------------------------------------------------------

export type PostSalePhase =
  | "agradecimiento"
  | "resena"
  | "referidos"
  | "recaptacion";

export interface PostSaleMessageParams {
  propertyCode: string;
  phase: PostSalePhase;
  newEstado: string;
  clientName?: string;
  comercialName?: string;
  postVentaUrl?: string;
}

const OPERATION_TYPE_LABEL: Record<string, string> = {
  vendid: "venta",
  alquilad: "alquiler",
  traspaso: "traspaso",
};

function operationLabel(newEstado: string): string {
  const lower = newEstado.toLowerCase();
  for (const [kw, label] of Object.entries(OPERATION_TYPE_LABEL)) {
    if (lower.includes(kw)) return label;
  }
  return "operación";
}

function buildAgradecimientoMessage(params: PostSaleMessageParams): string {
  const name = params.clientName ? ` ${params.clientName}` : "";
  const op = operationLabel(params.newEstado);
  return [
    `🏡 *Enhorabuena${name}!*`,
    ``,
    `Su ${op} se ha completado con éxito.`,
    `Gracias por confiar en URUS Capital.`,
    ``,
    params.comercialName
      ? `Su comercial de referencia es *${params.comercialName}*. No dude en contactarle para cualquier consulta.`
      : `Nuestro equipo queda a su disposición para lo que necesite.`,
  ].join("\n");
}

function buildRecaptacionMessage(params: PostSaleMessageParams): string {
  const name = params.clientName ? ` ${params.clientName}` : "";
  return [
    `🔑 *Hola${name}*`,
    ``,
    `Han pasado unos meses desde que cerramos su operación.`,
    `¿Le gustaría conocer nuevas oportunidades en su zona?`,
    ``,
    `Responda "Sí" y le enviaremos las opciones más interesantes.`,
  ].join("\n");
}

function buildResenaMessage(params: PostSaleMessageParams): string {
  const name = params.clientName ? ` ${params.clientName}` : "";
  const lines = [
    `⭐ *Tu opinión nos ayuda mucho*`,
    ``,
    `Hola${name}, nos alegra que todo vaya bien.`,
    `¿Podrías dejarnos una reseña? Solo toma un minuto.`,
  ];
  if (params.postVentaUrl) {
    lines.push(``, params.postVentaUrl);
  }
  lines.push(``, `¡Gracias!`);
  return lines.join("\n");
}

function buildReferidosMessage(params: PostSaleMessageParams): string {
  const name = params.clientName ? ` ${params.clientName}` : "";
  const lines = [
    `🤝 *¿Conoces a alguien que busque vivienda?*`,
    ``,
    `Hola${name}, si conoces a alguien que esté pensando en comprar o vender,`,
    `estaremos encantados de ayudarle como hicimos contigo.`,
  ];
  if (params.postVentaUrl) {
    lines.push(``, `Comparte este enlace:`, params.postVentaUrl);
  } else {
    lines.push(``, `Responda con el nombre y teléfono, y nos pondremos en contacto.`);
  }
  return lines.join("\n");
}

const PHASE_BUILDERS: Record<
  PostSalePhase,
  (params: PostSaleMessageParams) => string
> = {
  agradecimiento: buildAgradecimientoMessage,
  resena: buildResenaMessage,
  referidos: buildReferidosMessage,
  recaptacion: buildRecaptacionMessage,
};

export async function sendPostSaleMessage(
  to: string,
  params: PostSaleMessageParams,
  options?: SendOptions,
): Promise<SendMessageSuccess> {
  const builder = PHASE_BUILDERS[params.phase];
  if (!builder) {
    throw new Error(`sendPostSaleMessage: fase desconocida "${params.phase}"`);
  }
  return sendTextMessage(to, builder(params), options);
}

export interface ReviewRequestParams {
  propertyCode: string;
  clientName?: string;
  googleReviewUrl?: string;
}

export async function sendReviewRequest(
  to: string,
  params: ReviewRequestParams,
  options?: SendOptions,
): Promise<SendMessageSuccess> {
  const name = params.clientName ? ` ${params.clientName}` : "";
  const lines = [
    `⭐ *Hola${name}*`,
    ``,
    `Esperamos que todo esté yendo genial en su nuevo hogar.`,
    `Su opinión nos ayuda a mejorar y a que más personas confíen en nosotros.`,
    ``,
    `¿Nos dejaría una reseña? Solo le tomará un minuto:`,
  ];
  if (params.googleReviewUrl) {
    lines.push(params.googleReviewUrl);
  } else {
    lines.push(`Le enviaremos el enlace en breve.`);
  }
  lines.push(``, `¡Muchas gracias!`);
  return sendTextMessage(to, lines.join("\n"), options);
}

export interface ReviewReminderParams {
  propertyCode: string;
  clientName?: string;
  googleReviewUrl?: string;
}

export async function sendReviewReminder(
  to: string,
  params: ReviewReminderParams,
  options?: SendOptions,
): Promise<SendMessageSuccess> {
  const name = params.clientName ? ` ${params.clientName}` : "";
  const lines = [
    `⭐ *Hola${name}*`,
    ``,
    `Hace unos días le pedimos su opinión sobre la experiencia con URUS Capital.`,
    `Si aún no ha tenido ocasión, le agradeceríamos mucho una reseña:`,
  ];
  if (params.googleReviewUrl) {
    lines.push(``, params.googleReviewUrl);
  } else {
    lines.push(``, `Le enviaremos el enlace en breve.`);
  }
  lines.push(``, `¡Gracias por su tiempo!`, `El equipo de URUS Capital`);
  return sendTextMessage(to, lines.join("\n"), options);
}

export interface ReferralRequestParams {
  propertyCode: string;
  clientName?: string;
  clientType?: "comprador" | "inversor" | "vendedor";
  referralFormUrl?: string;
}

export async function sendReferralRequest(
  to: string,
  params: ReferralRequestParams,
  options?: SendOptions,
): Promise<SendMessageSuccess> {
  const name = params.clientName ? ` ${params.clientName}` : "";

  const cta =
    params.clientType === "inversor"
      ? `¿Conoce a alguien que también busque invertir en inmuebles?`
      : params.clientType === "vendedor"
        ? `¿Tiene algún conocido que quiera vender su propiedad?`
        : `¿Conoce a alguien que esté buscando una nueva casa?`;

  const lines = [
    `🤝 *Hola${name}*`,
    ``,
    cta,
    ``,
    `Si nos recomienda, ofreceremos un trato preferencial a su contacto.`,
  ];
  if (params.referralFormUrl) {
    lines.push(``, `Puede compartir este enlace:`, params.referralFormUrl);
  } else {
    lines.push(``, `Responda con el nombre y teléfono, y nos pondremos en contacto.`);
  }
  return sendTextMessage(to, lines.join("\n"), options);
}

// ---------------------------------------------------------------------------
// Firma digital — recordatorios y escalado (M8 Smart Closing)
// ---------------------------------------------------------------------------

export type SignatureReminderParams = {
  signerName: string;
  documentKind: string;
  operationRef: string;
  signingUrl: string;
};

const REMINDER_TEMPLATE_NAMES: Record<number, string> = {
  1:
    process.env.WHATSAPP_TEMPLATE_CONTRATO_FIRMA_D1 ??
    "contrato_firma_recordatorio_d1",
  3:
    process.env.WHATSAPP_TEMPLATE_CONTRATO_FIRMA_D3 ??
    "contrato_firma_recordatorio_d3",
  5:
    process.env.WHATSAPP_TEMPLATE_CONTRATO_FIRMA_D5 ??
    "contrato_firma_recordatorio_d5",
};

export async function sendSignatureReminderToSigner(
  to: string,
  params: SignatureReminderParams & { reminderDay: number },
  options?: SendOptions & { useTemplate?: boolean },
): Promise<SendMessageSuccess> {
  const templateName = REMINDER_TEMPLATE_NAMES[params.reminderDay];

  if (options?.useTemplate && templateName) {
    const template: TemplateObject = {
      name: templateName,
      language: { code: WHATSAPP_TEMPLATE_LANGUAGE_CODE },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: params.signerName },
            { type: "text", text: params.documentKind },
            { type: "text", text: params.operationRef },
            { type: "text", text: params.signingUrl },
          ],
        },
      ],
    };
    return sendTemplateMessage(to, template, options);
  }

  const isLast = params.reminderDay >= 5;
  const lines = [
    `📄 *Recordatorio: documento pendiente de firma*`,
    ``,
    `• Firmante: ${params.signerName}`,
    `• Documento: ${params.documentKind}`,
    `• Referencia: ${params.operationRef}`,
    ``,
    `Firma aquí: ${params.signingUrl}`,
  ];
  if (isLast) {
    lines.push(
      ``,
      `⚠️ Este es el último recordatorio automático antes del escalado.`,
    );
  }
  return sendTextMessage(to, lines.join("\n"), options);
}

export type SignatureSlaEscalationParams = {
  operationRef: string;
  documentKind: string;
  trackingUrl: string;
};

const SLA_ESCALATION_TEMPLATE =
  process.env.WHATSAPP_TEMPLATE_CONTRATO_FIRMA_SLA_ESCALADO ??
  "contrato_firma_sla_escalado";

export async function sendSignatureSlaEscalation(
  to: string,
  params: SignatureSlaEscalationParams,
  options?: SendOptions & { useTemplate?: boolean },
): Promise<SendMessageSuccess> {
  if (options?.useTemplate) {
    const template: TemplateObject = {
      name: SLA_ESCALATION_TEMPLATE,
      language: { code: WHATSAPP_TEMPLATE_LANGUAGE_CODE },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: params.operationRef },
            { type: "text", text: params.documentKind },
            { type: "text", text: params.trackingUrl },
          ],
        },
      ],
    };
    return sendTemplateMessage(to, template, options);
  }

  const lines = [
    `🔴 *SLA de firma incumplido*`,
    ``,
    `• Operación: ${params.operationRef}`,
    `• Documento: ${params.documentKind}`,
    ``,
    `Han pasado más de 5 días sin firma completa.`,
    `Seguimiento: ${params.trackingUrl}`,
  ];
  return sendTextMessage(to, lines.join("\n"), options);
}

// ---------------------------------------------------------------------------
// Smart Closing — notificaciones de borrador, envío a firma y post-firma (M8)
// ---------------------------------------------------------------------------

export type ContractDraftReadyParams = {
  operationId: string;
  documentKind: string;
  cloudinaryUrl: string;
  legalUiUrl: string;
};

export async function sendContractDraftReadyNotification(
  to: string,
  params: ContractDraftReadyParams,
  options?: SendOptions,
): Promise<SendMessageSuccess> {
  const lines = [
    `📄 *Borrador de contrato listo*`,
    ``,
    `• Operación: ${params.operationId}`,
    `• Tipo: ${params.documentKind}`,
    ``,
    `Documento: ${params.cloudinaryUrl}`,
    ``,
    `Revisar en el panel:`,
    params.legalUiUrl,
  ];
  return sendTextMessage(to, lines.join("\n"), { ...options, previewUrl: true });
}

export type SignatureInitialNotificationParams = {
  signerName: string;
  documentKind: string;
  operationRef: string;
  signingUrl: string;
};

const FIRMA_ENVIADA_TEMPLATE =
  process.env.WHATSAPP_TEMPLATE_CONTRATO_FIRMA_ENVIADA ??
  "contrato_firma_enviada";

/** Notificación de enlace de firma. Por defecto usa plantilla Meta (fuera de ventana 24h). Texto libre solo con `{ useTemplate: false }`. */
export async function sendSignatureInitialNotification(
  to: string,
  params: SignatureInitialNotificationParams,
  options?: SendOptions & { useTemplate?: boolean },
): Promise<SendMessageSuccess> {
  const useTemplate = options?.useTemplate !== false;
  if (useTemplate) {
    const template: TemplateObject = {
      name: FIRMA_ENVIADA_TEMPLATE,
      language: { code: WHATSAPP_TEMPLATE_LANGUAGE_CODE },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: params.signerName },
            { type: "text", text: params.documentKind },
            { type: "text", text: params.operationRef },
            { type: "text", text: params.signingUrl },
          ],
        },
      ],
    };
    return sendTemplateMessage(to, template, options);
  }

  const lines = [
    `📄 *Documento pendiente de firma*`,
    ``,
    `• Firmante: ${params.signerName}`,
    `• Documento: ${params.documentKind}`,
    `• Referencia: ${params.operationRef}`,
    ``,
    `Firma aquí: ${params.signingUrl}`,
  ];
  return sendTextMessage(to, lines.join("\n"), options);
}

export type FirmaCompletadaConfirmationParams = {
  operationRef: string;
  documentKind: string;
  legalDocUrl: string;
};

export async function sendFirmaCompletadaConfirmation(
  to: string,
  params: FirmaCompletadaConfirmationParams,
  options?: SendOptions,
): Promise<SendMessageSuccess> {
  const lines = [
    `✅ *Documento firmado correctamente*`,
    ``,
    `• Operación: ${params.operationRef}`,
    `• Documento: ${params.documentKind}`,
    ``,
    `Todas las partes han firmado.`,
    `Ver documento: ${params.legalDocUrl}`,
  ];
  return sendTextMessage(to, lines.join("\n"), options);
}

// ---------------------------------------------------------------------------
// Firma rechazada — notificación al comercial/gestor (M8)
// ---------------------------------------------------------------------------

export type FirmaRechazadaNotificationParams = {
  operationRef: string;
  documentKind: string;
  signerName: string;
  reason: string | null;
  legalDocUrl: string;
};

export async function sendFirmaRechazadaNotification(
  to: string,
  params: FirmaRechazadaNotificationParams,
  options?: SendOptions,
): Promise<SendMessageSuccess> {
  const lines = [
    `❌ *Firma rechazada por el firmante*`,
    ``,
    `• Operación: ${params.operationRef}`,
    `• Documento: ${params.documentKind}`,
    `• Firmante: ${params.signerName}`,
    ...(params.reason ? [`• Motivo: ${params.reason}`] : []),
    ``,
    `El documento ha vuelto a estado borrador para re-negociación.`,
    `Ver contrato: ${params.legalDocUrl}`,
  ];
  return sendTextMessage(to, lines.join("\n"), options);
}

// ---------------------------------------------------------------------------
// Motor de Pricing — informe generado (M7)
// ---------------------------------------------------------------------------

function isPublicHttpsImageUrl(url: string | null | undefined): url is string {
  if (!url?.trim()) return false;
  try {
    return new URL(url.trim()).protocol === "https:";
  } catch {
    return false;
  }
}

function buildPricingReportWhatsAppBody(params: {
  propertyRef: string;
  propertyAddress: string;
  semaforo: string;
  gapPorcentaje: string;
  informeUrl: string;
}): string {
  const lines = [
    `📊 *Informe de pricing generado*`,
    ``,
    `• Referencia: ${params.propertyRef}`,
    `• Dirección: ${params.propertyAddress}`,
    `• Semáforo: ${params.semaforo}`,
    `• Gap vs mercado: ${params.gapPorcentaje}`,
    ``,
    `Consulta el informe completo:`,
    params.informeUrl,
  ];
  return lines.join("\n");
}

export type PricingReportParams = {
  comercialNombre: string;
  /** Referencia de catálogo (Inmovilla `ref`), no el código interno. */
  propertyRef: string;
  /** Dirección o titular descriptivo (calle/número del raw, titulo o ciudad·zona). */
  propertyAddress: string;
  /** URL HTTPS pública de la foto principal; opcional. */
  mainPhotoUrl?: string | null;
  semaforo: string;
  gapPorcentaje: string;
  informeUrl: string;
};

const PRICING_INFORME_TEMPLATE =
  process.env.WHATSAPP_TEMPLATE_PRICING_INFORME ?? "pricing_informe_listo";

export async function sendPricingReportToCommercial(
  to: string,
  params: PricingReportParams,
  options?: SendOptions & { useTemplate?: boolean },
): Promise<SendMessageSuccess> {
  if (!shouldSendWhatsAppToCommercials()) {
    return skippedCommercialSend(to, "sendPricingReportToCommercial");
  }
  if (options?.useTemplate) {
    const template: TemplateObject = {
      name: PRICING_INFORME_TEMPLATE,
      language: { code: WHATSAPP_TEMPLATE_LANGUAGE_CODE },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: params.comercialNombre },
            { type: "text", text: params.propertyRef },
            { type: "text", text: params.propertyAddress },
            { type: "text", text: params.semaforo },
            { type: "text", text: params.gapPorcentaje },
            { type: "text", text: params.informeUrl },
          ],
        },
      ],
    };
    return sendTemplateMessage(to, template, options);
  }

  const body = buildPricingReportWhatsAppBody({
    propertyRef: params.propertyRef,
    propertyAddress: params.propertyAddress,
    semaforo: params.semaforo,
    gapPorcentaje: params.gapPorcentaje,
    informeUrl: params.informeUrl,
  });

  const imageLink = isPublicHttpsImageUrl(params.mainPhotoUrl)
    ? params.mainPhotoUrl.trim()
    : null;

  if (imageLink) {
    await sendImageMessage(to, { link: imageLink }, options);
  }

  return sendTextMessage(to, body, { ...options, previewUrl: true });
}

// ---------------------------------------------------------------------------
// Post-Venta — cadencias automatizadas con plantillas (M9)
// ---------------------------------------------------------------------------

export type PostventaAgradecimientoParams = {
  buyerName: string;
  agencyName: string;
  comercialName: string;
};

const POSTVENTA_AGRADECIMIENTO_TEMPLATE =
  process.env.WHATSAPP_TEMPLATE_POSTVENTA_AGRADECIMIENTO ??
  "postventa_agradecimiento";

export async function sendPostventaAgradecimiento(
  to: string,
  params: PostventaAgradecimientoParams,
  options?: SendOptions & { useTemplate?: boolean },
): Promise<SendMessageSuccess> {
  if (options?.useTemplate) {
    const template: TemplateObject = {
      name: POSTVENTA_AGRADECIMIENTO_TEMPLATE,
      language: { code: WHATSAPP_TEMPLATE_LANGUAGE_CODE },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: params.buyerName },
            { type: "text", text: params.agencyName },
            { type: "text", text: params.comercialName },
          ],
        },
      ],
    };
    return sendTemplateMessage(to, template, options);
  }

  const lines = [
    `🎉 *¡Enhorabuena por tu nueva vivienda!*`,
    ``,
    `Hola ${params.buyerName}, gracias por confiar en ${params.agencyName} y en tu agente ${params.comercialName}.`,
    ``,
    `Si necesitas algo durante estos primeros días, estamos aquí. ¡Disfrútala!`,
  ];
  return sendTextMessage(to, lines.join("\n"), options);
}

export type PostventaResenaParams = {
  buyerName: string;
  reviewUrl: string;
};

const POSTVENTA_RESENA_TEMPLATE =
  process.env.WHATSAPP_TEMPLATE_POSTVENTA_RESENA ?? "postventa_resena";

export async function sendPostventaResena(
  to: string,
  params: PostventaResenaParams,
  options?: SendOptions & { useTemplate?: boolean },
): Promise<SendMessageSuccess> {
  if (options?.useTemplate) {
    const template: TemplateObject = {
      name: POSTVENTA_RESENA_TEMPLATE,
      language: { code: WHATSAPP_TEMPLATE_LANGUAGE_CODE },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: params.buyerName },
            { type: "text", text: params.reviewUrl },
          ],
        },
      ],
    };
    return sendTemplateMessage(to, template, options);
  }

  const lines = [
    `⭐ *Tu opinión nos ayuda mucho*`,
    ``,
    `Hola ${params.buyerName}, nos alegra que todo vaya bien.`,
    `¿Podrías dejarnos una reseña? Solo toma un minuto:`,
    params.reviewUrl,
    ``,
    `¡Gracias!`,
  ];
  return sendTextMessage(to, lines.join("\n"), { ...options, previewUrl: true });
}

export type PostventaReferidosParams = {
  buyerName: string;
  referralUrl: string;
};

const POSTVENTA_REFERIDOS_TEMPLATE =
  process.env.WHATSAPP_TEMPLATE_POSTVENTA_REFERIDOS ?? "postventa_referidos";

export async function sendPostventaReferidos(
  to: string,
  params: PostventaReferidosParams,
  options?: SendOptions & { useTemplate?: boolean },
): Promise<SendMessageSuccess> {
  if (options?.useTemplate) {
    const template: TemplateObject = {
      name: POSTVENTA_REFERIDOS_TEMPLATE,
      language: { code: WHATSAPP_TEMPLATE_LANGUAGE_CODE },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: params.buyerName },
            { type: "text", text: params.referralUrl },
          ],
        },
      ],
    };
    return sendTemplateMessage(to, template, options);
  }

  const lines = [
    `🤝 *¿Conoces a alguien que busque vivienda?*`,
    ``,
    `Hola ${params.buyerName}, si conoces a alguien que esté pensando en comprar o vender,`,
    `estaremos encantados de ayudarle como hicimos contigo.`,
    ``,
    `Comparte este enlace:`,
    params.referralUrl,
  ];
  return sendTextMessage(to, lines.join("\n"), { ...options, previewUrl: true });
}

export type PostventaRecaptacionParams = {
  buyerName: string;
  comercialName: string;
  contactUrl: string;
};

const POSTVENTA_RECAPTACION_TEMPLATE =
  process.env.WHATSAPP_TEMPLATE_POSTVENTA_RECAPTACION ??
  "postventa_recaptacion";

export async function sendPostventaRecaptacion(
  to: string,
  params: PostventaRecaptacionParams,
  options?: SendOptions & { useTemplate?: boolean },
): Promise<SendMessageSuccess> {
  if (options?.useTemplate) {
    const template: TemplateObject = {
      name: POSTVENTA_RECAPTACION_TEMPLATE,
      language: { code: WHATSAPP_TEMPLATE_LANGUAGE_CODE },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: params.buyerName },
            { type: "text", text: params.comercialName },
            { type: "text", text: params.contactUrl },
          ],
        },
      ],
    };
    return sendTemplateMessage(to, template, options);
  }

  const lines = [
    `👋 *¿Cómo va todo en tu vivienda?*`,
    ``,
    `Hola ${params.buyerName}, han pasado unos meses y queríamos saber si necesitas algo.`,
    `Si te planteas vender o conoces a alguien interesado, tu agente ${params.comercialName} está disponible:`,
    params.contactUrl,
  ];
  return sendTextMessage(to, lines.join("\n"), { ...options, previewUrl: true });
}

// ── M12 — Desarrollo Continuo: nudge de ejercicio diario/semanal ────────────

const DEV_EXERCISE_NUDGE_TEMPLATE =
  process.env.WHATSAPP_TEMPLATE_DEV_EXERCISE ?? "dev_ejercicio_diario";

export interface DevExerciseNudgeParams {
  comercialName: string;
  exerciseTypeLabel: string;
  themeLabel: string;
}

export async function sendDevExerciseNudge(
  to: string,
  params: DevExerciseNudgeParams,
  options?: SendOptions,
): Promise<SendMessageSuccess> {
  if (!shouldSendWhatsAppToCommercials()) {
    return skippedCommercialSend(to, "sendDevExerciseNudge");
  }
  const template: TemplateObject = {
    name: DEV_EXERCISE_NUDGE_TEMPLATE,
    language: { code: WHATSAPP_TEMPLATE_LANGUAGE_CODE },
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: params.comercialName },
          { type: "text", text: params.exerciseTypeLabel },
          { type: "text", text: params.themeLabel },
        ],
      },
    ],
  };
  return sendTemplateMessage(to, template, options);
}

// ---------------------------------------------------------------------------
// Post-venta — Cumpleaños (plantilla obligatoria Meta, envío anual)
// ---------------------------------------------------------------------------

export type PostventaCumpleanosParams = {
  buyerName: string;
  agencyName: string;
};

const POSTVENTA_CUMPLEANOS_TEMPLATE =
  process.env.WHATSAPP_TEMPLATE_POSTVENTA_CUMPLEANOS ??
  "postventa_cumpleanos";

export async function sendPostventaCumpleanos(
  to: string,
  params: PostventaCumpleanosParams,
  options?: SendOptions,
): Promise<SendMessageSuccess> {
  const template: TemplateObject = {
    name: POSTVENTA_CUMPLEANOS_TEMPLATE,
    language: { code: WHATSAPP_TEMPLATE_LANGUAGE_CODE },
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: params.buyerName },
          { type: "text", text: params.agencyName },
        ],
      },
    ],
  };
  return sendTemplateMessage(to, template, options);
}

// ---------------------------------------------------------------------------
// Post-venta — Navidad (plantilla obligatoria Meta, envío anual 24-dic)
// ---------------------------------------------------------------------------

export type PostventaNavidadParams = {
  buyerName: string;
  agencyName: string;
};

const POSTVENTA_NAVIDAD_TEMPLATE =
  process.env.WHATSAPP_TEMPLATE_POSTVENTA_NAVIDAD ?? "postventa_navidad";

export async function sendPostventaNavidad(
  to: string,
  params: PostventaNavidadParams,
  options?: SendOptions,
): Promise<SendMessageSuccess> {
  const template: TemplateObject = {
    name: POSTVENTA_NAVIDAD_TEMPLATE,
    language: { code: WHATSAPP_TEMPLATE_LANGUAGE_CODE },
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: params.buyerName },
          { type: "text", text: params.agencyName },
        ],
      },
    ],
  };
  return sendTemplateMessage(to, template, options);
}
