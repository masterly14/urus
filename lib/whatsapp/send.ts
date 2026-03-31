/**
 * Funciones de envío de alto nivel para WhatsApp Cloud API (Meta).
 * Capa de abstracción sobre createWhatsAppClient para los casos de uso del sistema.
 */

import { createWhatsAppClient } from "./client";
import type {
  WhatsAppClientConfig,
  TemplateObject,
  InteractiveObject,
  SendMessageSuccess,
} from "./types";

type SendOptions = Partial<WhatsAppClientConfig> & {
  /** WAMID del mensaje previo (para replies contextualizados). */
  contextMessageId?: string;
};

/**
 * Envía un mensaje de texto libre.
 * Solo válido dentro de una ventana de 24h de conversación iniciada por el usuario.
 */
export async function sendTextMessage(
  to: string,
  body: string,
  options?: SendOptions & { previewUrl?: boolean },
): Promise<SendMessageSuccess> {
  const client = createWhatsAppClient(options);
  return client.sendMessage({
    to,
    type: "text",
    text: { body, preview_url: options?.previewUrl ?? false },
    ...(options?.contextMessageId
      ? { context: { message_id: options.contextMessageId } }
      : {}),
  });
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
  const client = createWhatsAppClient(options);
  return client.sendMessage({
    to,
    type: "template",
    template,
    ...(options?.contextMessageId
      ? { context: { message_id: options.contextMessageId } }
      : {}),
  });
}

/**
 * Envía un mensaje interactivo con botones de respuesta rápida (reply buttons)
 * o lista de opciones. Requiere ventana de conversación activa.
 */
export async function sendInteractiveMessage(
  to: string,
  interactive: InteractiveObject,
  options?: SendOptions,
): Promise<SendMessageSuccess> {
  const client = createWhatsAppClient(options);
  return client.sendMessage({
    to,
    type: "interactive",
    interactive,
    ...(options?.contextMessageId
      ? { context: { message_id: options.contextMessageId } }
      : {}),
  });
}

/**
 * Helper: envía la plantilla de match de propiedad estándar del sistema.
 * Template esperado: "propiedad_match" con variables {{1}}=nombre, {{2}}=enlace.
 * Requiere que la plantilla esté aprobada en Meta Business Manager.
 */
export async function sendMatchNotification(
  to: string,
  params: { nombre: string; enlacePropiedad: string },
  options?: SendOptions,
): Promise<SendMessageSuccess> {
  const template: TemplateObject = {
    name: "propiedad_match",
    language: { code: "es_ES" },
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

const LEAD_ASSIGNED_TEMPLATE = "lead_asignado";

/**
 * Notifica al comercial que tiene un nuevo lead asignado.
 *
 * MVP: usa sendTextMessage (requiere ventana de 24h).
 * Producción: sustituir por sendTemplateMessage con plantilla "lead_asignado"
 * aprobada en Meta Business Manager.
 */
export async function sendLeadAssignedToCommercial(
  to: string,
  params: LeadAssignedParams,
  options?: SendOptions & { useTemplate?: boolean },
): Promise<SendMessageSuccess> {
  if (options?.useTemplate) {
    const template: TemplateObject = {
      name: LEAD_ASSIGNED_TEMPLATE,
      language: { code: "es_ES" },
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

  const slaLabel = formatSlaLabel(params.slaLevel, params.maxResponseMs);
  const lines = [
    `📋 *Nuevo lead asignado*`,
    ``,
    `• ID: ${params.leadId}`,
    `• Score: ${params.score}/100`,
    `• SLA: ${slaLabel}`,
  ];
  if (params.ciudad) lines.push(`• Ciudad: ${params.ciudad}`);
  if (params.reasons?.length) {
    lines.push(`• Señales: ${params.reasons.join(", ")}`);
  }
  lines.push(``, `Revisa el panel para más detalles.`);

  return sendTextMessage(to, lines.join("\n"), options);
}

function formatSlaLabel(level: string, maxResponseMs?: number): string {
  if (!maxResponseMs) return level;
  const minutes = Math.round(maxResponseMs / 60_000);
  if (minutes < 60) return `${level} (< ${minutes}min)`;
  return `${level} (< ${Math.round(minutes / 60)}h)`;
}

export interface FollowUpParams {
  leadId: string;
  step: string;
  score: number;
  daysSinceCreation?: number;
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
  if (options?.useTemplate) {
    const template: TemplateObject = {
      name: "lead_follow_up",
      language: { code: "es_ES" },
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
 */
export async function sendMicrositeLinkToBuyer(
  to: string,
  params: MicrositeBuyerLinkParams,
  options?: SendOptions,
): Promise<SendMessageSuccess> {
  const firstName = params.demandNombre.trim().split(/\s+/)[0];
  const lines = [
    `Hola${firstName ? ` ${firstName}` : ""},`,
    ``,
    `Aquí tienes una selección de propiedades que encajan con tu búsqueda:`,
    params.buyerUrl,
    ``,
    `Indica cuáles te interesan desde la página.`,
  ];
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

/**
 * Envía un recordatorio de firma al firmante (D+1, D+3 o D+5).
 * Usa plantillas Meta UTILITY es_ES con 4 variables de cuerpo.
 * MVP: texto libre. Producción: sustituir por sendTemplateMessage.
 */
export async function sendSignatureReminderToSigner(
  to: string,
  params: SignatureReminderParams & { reminderDay: number },
  options?: SendOptions & { useTemplate?: boolean },
): Promise<SendMessageSuccess> {
  const templateName = REMINDER_TEMPLATE_NAMES[params.reminderDay];

  if (options?.useTemplate && templateName) {
    const template: TemplateObject = {
      name: templateName,
      language: { code: "es_ES" },
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

/**
 * Escalado por SLA de firma: notifica al comercial y al gestor (BO).
 * Plantilla Meta UTILITY es_ES con 3 variables de cuerpo.
 */
export async function sendSignatureSlaEscalation(
  to: string,
  params: SignatureSlaEscalationParams,
  options?: SendOptions & { useTemplate?: boolean },
): Promise<SendMessageSuccess> {
  if (options?.useTemplate) {
    const template: TemplateObject = {
      name: SLA_ESCALATION_TEMPLATE,
      language: { code: "es_ES" },
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

/**
 * Notifica al gestor/comercial que hay un borrador de contrato listo para revisión.
 * MVP: texto libre. Producción: plantilla "contrato_borrador_listo".
 */
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

/**
 * Envía la URL de firma al firmante inmediatamente después de crear la petición.
 * MVP: texto libre. Producción: plantilla "contrato_firma_enviada".
 */
export async function sendSignatureInitialNotification(
  to: string,
  params: SignatureInitialNotificationParams,
  options?: SendOptions & { useTemplate?: boolean },
): Promise<SendMessageSuccess> {
  if (options?.useTemplate) {
    const template: TemplateObject = {
      name: FIRMA_ENVIADA_TEMPLATE,
      language: { code: "es_ES" },
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

/**
 * Confirmación tras firma completa: notifica al comercial y al vendedor.
 * MVP: texto libre.
 */
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
// Motor de Pricing — informe generado (M7)
// ---------------------------------------------------------------------------

export type PricingReportParams = {
  comercialNombre: string;
  propertyCode: string;
  semaforo: string;
  gapPorcentaje: string;
  informeUrl: string;
};

const PRICING_INFORME_TEMPLATE =
  process.env.WHATSAPP_TEMPLATE_PRICING_INFORME ?? "pricing_informe_listo";

/**
 * Notifica al comercial que se ha generado un informe de pricing.
 * Business-initiated → requiere plantilla aprobada en Meta.
 * MVP: texto libre. Producción: plantilla "pricing_informe_listo".
 */
export async function sendPricingReportToCommercial(
  to: string,
  params: PricingReportParams,
  options?: SendOptions & { useTemplate?: boolean },
): Promise<SendMessageSuccess> {
  if (options?.useTemplate) {
    const template: TemplateObject = {
      name: PRICING_INFORME_TEMPLATE,
      language: { code: "es_ES" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: params.comercialNombre },
            { type: "text", text: params.propertyCode },
            { type: "text", text: params.semaforo },
            { type: "text", text: params.gapPorcentaje },
            { type: "text", text: params.informeUrl },
          ],
        },
      ],
    };
    return sendTemplateMessage(to, template, options);
  }

  const lines = [
    `📊 *Informe de pricing generado*`,
    ``,
    `• Inmueble: ${params.propertyCode}`,
    `• Semáforo: ${params.semaforo}`,
    `• Gap vs mercado: ${params.gapPorcentaje}`,
    ``,
    `Consulta el informe completo:`,
    params.informeUrl,
  ];
  return sendTextMessage(to, lines.join("\n"), { ...options, previewUrl: true });
}
