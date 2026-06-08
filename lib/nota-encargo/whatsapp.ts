/**
 * WhatsApp sending functions specific to the Nota de Encargo flow.
 *
 * El formulario y la firma van al comercial; solo el PDF firmado va al propietario.
 */

import {
  sendTemplateMessage,
  sendInteractiveMessage,
  sendDocumentMessage,
} from "@/lib/whatsapp/send";
import type { WhatsAppTraceOptions } from "@/lib/whatsapp/send";
import type {
  TemplateObject,
  InteractiveObject,
  SendMessageSuccess,
} from "@/lib/whatsapp/types";

type NotaEncargoSendOptions = {
  trace?: WhatsAppTraceOptions;
};

const WHATSAPP_TEMPLATE_LANGUAGE_CODE =
  process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "es";

// ---------------------------------------------------------------------------
// WhatsApp Flow (formulario nota de encargo → comercial)
// ---------------------------------------------------------------------------

const FORMULARIO_TEMPLATE =
  process.env.WHATSAPP_TEMPLATE_NOTA_ENCARGO_FORMULARIO ||
  "nota_encargo";

const FLOW_ID = process.env.WHATSAPP_FLOW_NOTA_ENCARGO_ID || "";

export async function sendNotaEncargoFlow(
  to: string,
  params: {
    sessionId: string;
    direccion: string;
    tipoOperacion: string;
    precio: number;
    propertyRef: string;
    refCatastral?: string | null;
    propietarioNombre?: string;
  },
  options?: NotaEncargoSendOptions,
): Promise<SendMessageSuccess> {
  const precioFmt =
    new Intl.NumberFormat("es-ES").format(params.precio) + " €";

  if (FLOW_ID) {
    return sendNotaEncargoFlowInteractive(to, params, precioFmt, options);
  }

  const template: TemplateObject = {
    name: FORMULARIO_TEMPLATE,
    language: { code: WHATSAPP_TEMPLATE_LANGUAGE_CODE },
    components: [
      {
        type: "body",
        parameters: [
          {
            type: "text",
            text: params.propietarioNombre || "propietario",
          },
          { type: "text", text: params.propertyRef },
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
                direccion_inmueble: params.direccion,
                referencia_catastral: params.refCatastral ?? "",
                tipo_operacion: params.tipoOperacion,
                precio_inmueble: precioFmt,
              },
            },
          },
        ],
      },
    ],
  };

  return sendTemplateMessage(to, template, options);
}

async function sendNotaEncargoFlowInteractive(
  to: string,
  params: {
    sessionId: string;
    direccion: string;
    tipoOperacion: string;
    precio: number;
    propertyRef: string;
    refCatastral?: string | null;
  },
  precioFmt: string,
  options?: NotaEncargoSendOptions,
): Promise<SendMessageSuccess> {
  const interactive: InteractiveObject = {
    type: "flow",
    header: { type: "text", text: "Nota de Encargo" },
    body: {
      text: `Complete los datos para la nota de encargo de ${params.propertyRef}.`,
    },
    footer: { text: "URUS Capital Group" },
    action: {
      name: "flow",
      parameters: {
        flow_message_version: "3",
        flow_id: FLOW_ID,
        flow_cta: "Completar formulario",
        flow_token: params.sessionId,
        flow_action: "navigate",
        flow_action_payload: {
          screen: "DATOS_PERSONALES",
          data: JSON.stringify({
            flow_token: params.sessionId,
            direccion_inmueble: params.direccion,
            referencia_catastral: params.refCatastral ?? "",
            tipo_operacion: params.tipoOperacion,
            precio_inmueble: precioFmt,
          }),
        },
      },
    },
  };

  return sendInteractiveMessage(to, interactive, options);
}

// ---------------------------------------------------------------------------
// Documento firmado → propietario
// ---------------------------------------------------------------------------

export async function sendNotaEncargoDocumentoFirmado(
  to: string,
  params: {
    propertyRef: string;
    signedDocumentUrl: string;
  },
  options?: NotaEncargoSendOptions,
): Promise<SendMessageSuccess> {
  return sendDocumentMessage(
    to,
    {
      link: params.signedDocumentUrl,
      filename: `nota_encargo_${params.propertyRef}_firmada.pdf`,
      caption:
        `✅ Aquí tiene su Nota de Encargo firmada (ref: ${params.propertyRef}). ` +
        `Guarde este documento para sus registros. Gracias por confiar en URUS Capital Group.`,
    },
    options,
  );
}
