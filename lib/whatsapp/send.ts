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
