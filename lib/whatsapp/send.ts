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
