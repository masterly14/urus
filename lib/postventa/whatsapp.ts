/**
 * Senders WhatsApp específicos del flujo post-venta:
 * - Envío del formulario inicial (WhatsApp Flow) tras cierre de operación.
 *
 * Los senders de mensajes de cadencia (agradecimiento, soporte, reseña,
 * referidos, recaptación, cumpleaños y navidad) viven en `lib/whatsapp/send.ts`.
 */

import {
  sendTemplateMessage,
  sendInteractiveMessage,
} from "@/lib/whatsapp/send";
import type {
  TemplateObject,
  InteractiveObject,
  SendMessageSuccess,
} from "@/lib/whatsapp/types";

const WHATSAPP_TEMPLATE_LANGUAGE_CODE =
  process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "es";

const POSTVENTA_FORMULARIO_TEMPLATE =
  process.env.WHATSAPP_TEMPLATE_POSTVENTA_FORMULARIO ??
  "postventa_formulario";

const POSTVENTA_FLOW_ID = process.env.WHATSAPP_FLOW_POSTVENTA_SURVEY_ID || "";

export interface SendPostventaFormularioParams {
  /** `flow_token` = id de `PostventaSurveySession`. */
  sessionId: string;
  buyerName: string;
  operationRef: string;
}

/**
 * Envía el formulario post-venta al comprador.
 *
 * Fuera de ventana 24h: enviamos como plantilla Meta con botón `sub_type=flow`.
 * Dentro de ventana 24h (tests E2E): enviamos como mensaje interactivo `type=flow`.
 *
 * El webhook posterior (`nfm_reply`) es quien recoge las respuestas del formulario
 * y alimenta `lib/postventa/form-response-handler.ts`.
 */
export async function sendPostventaFormulario(
  to: string,
  params: SendPostventaFormularioParams,
): Promise<SendMessageSuccess> {
  if (POSTVENTA_FLOW_ID) {
    return sendPostventaFormularioInteractive(to, params);
  }

  const template: TemplateObject = {
    name: POSTVENTA_FORMULARIO_TEMPLATE,
    language: { code: WHATSAPP_TEMPLATE_LANGUAGE_CODE },
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: params.buyerName || "cliente" },
          { type: "text", text: params.operationRef },
        ],
      },
      {
        type: "button",
        sub_type: "flow",
        index: "0",
        parameters: [
          {
            type: "action",
            action: {
              flow_token: params.sessionId,
              flow_action_data: {
                flow_token: params.sessionId,
                buyer_name_hint: params.buyerName,
                operation_ref: params.operationRef,
              },
            },
          },
        ],
      },
    ],
  };

  return sendTemplateMessage(to, template);
}

async function sendPostventaFormularioInteractive(
  to: string,
  params: SendPostventaFormularioParams,
): Promise<SendMessageSuccess> {
  const interactive: InteractiveObject = {
    type: "flow",
    header: { type: "text", text: "Post-venta URUS Capital" },
    body: {
      text:
        `Hola ${params.buyerName || "cliente"}, completa estos datos en menos de un minuto ` +
        `para recibir novedades útiles y felicitaciones personalizadas en tu nueva vivienda.`,
    },
    footer: { text: `Operación ${params.operationRef}` },
    action: {
      name: "flow",
      parameters: {
        flow_message_version: "3",
        flow_id: POSTVENTA_FLOW_ID,
        flow_cta: "Rellenar 1 minuto",
        flow_token: params.sessionId,
        flow_action: "navigate",
        flow_action_payload: {
          screen: "BIENVENIDA",
          data: JSON.stringify({
            flow_token: params.sessionId,
            buyer_name_hint: params.buyerName,
            operation_ref: params.operationRef,
          }),
        },
      },
    },
  };

  return sendInteractiveMessage(to, interactive);
}
