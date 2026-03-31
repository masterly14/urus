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
// Post-Venta (M9) — cadencia de mensajes al cliente tras cierre
// ---------------------------------------------------------------------------

export type PostSalePhase =
  | "agradecimiento"
  | "soporte"
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

function buildSoporteMessage(params: PostSaleMessageParams): string {
  const name = params.clientName ? ` ${params.clientName}` : "";
  const lines = [
    `👋 *Hola${name}*`,
    ``,
    `Queremos asegurarnos de que todo va bien tras la entrega.`,
    `¿Necesita ayuda con algo?`,
  ];
  if (params.postVentaUrl) {
    lines.push(``, `Puede indicarnos aquí:`, params.postVentaUrl);
  } else {
    lines.push(``, `Responda a este mensaje y le atenderemos encantados.`);
  }
  return lines.join("\n");
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

const PHASE_BUILDERS: Record<
  "agradecimiento" | "soporte" | "recaptacion",
  (params: PostSaleMessageParams) => string
> = {
  agradecimiento: buildAgradecimientoMessage,
  soporte: buildSoporteMessage,
  recaptacion: buildRecaptacionMessage,
};

/**
 * Envía un mensaje de post-venta genérico (agradecimiento / soporte / re-captación).
 * MVP: texto libre. Producción: plantilla aprobada por fase.
 */
export async function sendPostSaleMessage(
  to: string,
  params: PostSaleMessageParams,
  options?: SendOptions,
): Promise<SendMessageSuccess> {
  const builder = PHASE_BUILDERS[params.phase as keyof typeof PHASE_BUILDERS];
  if (!builder) {
    throw new Error(`No message builder for post-sale phase: ${params.phase}`);
  }
  return sendTextMessage(to, builder(params), options);
}

export interface ReviewRequestParams {
  propertyCode: string;
  clientName?: string;
  googleReviewUrl?: string;
}

/**
 * Solicita una reseña de Google al cliente (fase 3 de post-venta).
 * Solo se envía si no hay incidencias abiertas.
 * MVP: texto libre. Producción: plantilla "solicitud_resena".
 */
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

/**
 * Recordatorio de reseña (D+17 aprox): se envía si el cliente no respondió a la solicitud inicial.
 * MVP: texto libre. Producción: plantilla "recordatorio_resena" (es_ES).
 */
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

/**
 * Activa referidos (fase 4 de post-venta): mensaje personalizado según tipo de cliente.
 * MVP: texto libre. Producción: plantilla "activacion_referidos".
 */
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
