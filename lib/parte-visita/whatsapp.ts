/**
 * WhatsApp sending functions specific to the Parte de Visita flow.
 */

import {
  sendTemplateMessage,
  sendInteractiveMessage,
  sendDocumentMessage,
  type WhatsAppTraceOptions,
} from "@/lib/whatsapp/send";
import type {
  TemplateObject,
  InteractiveObject,
  SendMessageSuccess,
} from "@/lib/whatsapp/types";

const WHATSAPP_TEMPLATE_LANGUAGE_CODE =
  process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "es";

const FLOW_ID = process.env.WHATSAPP_FLOW_PARTE_VISITA_ID || "";

const FORMULARIO_TEMPLATE =
  process.env.WHATSAPP_TEMPLATE_PARTE_VISITA_FORMULARIO ||
  "parte_visita_formulario";
const CONTEXTO_TEMPLATE =
  process.env.WHATSAPP_TEMPLATE_PARTE_VISITA_CONTEXTO ||
  "visita_contexto_propiedad";

// Idiomas específicos por plantilla. Cada plantilla en Meta puede estar
// aprobada en un código distinto (p. ej. "es" vs "es_ES"). Si la plantilla
// global `WHATSAPP_TEMPLATE_LANGUAGE` no coincide, Meta responde
// `#132001 Template name does not exist in the translation`.
const FORMULARIO_LANGUAGE =
  process.env.WHATSAPP_TEMPLATE_PARTE_VISITA_FORMULARIO_LANGUAGE?.trim() ||
  WHATSAPP_TEMPLATE_LANGUAGE_CODE;
const CONTEXTO_LANGUAGE =
  process.env.WHATSAPP_TEMPLATE_PARTE_VISITA_CONTEXTO_LANGUAGE?.trim() ||
  WHATSAPP_TEMPLATE_LANGUAGE_CODE;

// ---------------------------------------------------------------------------
// Send Flow (formulario parte de visita)
// ---------------------------------------------------------------------------

function buildFormularioTrace(
  to: string,
  params: { sessionId: string; propertyRef: string },
  kind: "template" | "interactive",
): WhatsAppTraceOptions {
  return {
    source: "parte_visita",
    kind:
      kind === "template"
        ? "parte_visita_formulario_template"
        : "parte_visita_formulario_flow",
    aggregateId: to,
    payload: {
      parteVisitaSessionId: params.sessionId,
      propertyRef: params.propertyRef,
      flowToken: params.sessionId,
    },
  };
}

function buildContextoTrace(
  to: string,
  params: { sessionId: string; propertyRef: string; propertyUrl: string },
): WhatsAppTraceOptions {
  return {
    source: "parte_visita",
    kind: "parte_visita_contexto_propiedad",
    aggregateId: to,
    payload: {
      parteVisitaSessionId: params.sessionId,
      propertyRef: params.propertyRef,
      propertyUrl: params.propertyUrl,
    },
  };
}

export async function sendParteVisitaContexto(
  to: string,
  params: {
    sessionId: string;
    propertyRef: string;
    propertyTitle: string;
    propertyUrl: string;
  },
): Promise<SendMessageSuccess> {
  const template: TemplateObject = {
    name: CONTEXTO_TEMPLATE,
    language: { code: CONTEXTO_LANGUAGE },
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: params.propertyTitle },
          { type: "text", text: params.propertyUrl },
        ],
      },
    ],
  };

  return sendTemplateMessage(to, template, {
    trace: buildContextoTrace(to, params),
  });
}

export async function sendParteVisitaFlow(
  to: string,
  params: {
    sessionId: string;
    direccion: string;
    tipoOperacion: string;
    precio: number;
    propertyRef: string;
    agenteName: string;
    fechaVisita: string;
    horaVisita: string;
  },
): Promise<SendMessageSuccess> {
  const precioFmt =
    new Intl.NumberFormat("es-ES").format(params.precio) + " €";

  if (FLOW_ID) {
    return sendParteVisitaFlowInteractive(to, params, precioFmt);
  }

  const template: TemplateObject = {
    name: FORMULARIO_TEMPLATE,
    language: { code: FORMULARIO_LANGUAGE },
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: "interesado" },
          { type: "text", text: params.direccion || params.propertyRef },
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
                tipo_operacion: params.tipoOperacion,
                precio_inmueble: precioFmt,
                agente_nombre: params.agenteName,
                fecha_visita: params.fechaVisita,
                hora_visita: params.horaVisita,
              },
            },
          },
        ],
      },
    ],
  };

  return sendTemplateMessage(to, template, {
    trace: buildFormularioTrace(to, params, "template"),
  });
}

async function sendParteVisitaFlowInteractive(
  to: string,
  params: {
    sessionId: string;
    direccion: string;
    tipoOperacion: string;
    precio: number;
    propertyRef: string;
    agenteName: string;
    fechaVisita: string;
    horaVisita: string;
  },
  precioFmt: string,
): Promise<SendMessageSuccess> {
  const interactive: InteractiveObject = {
    type: "flow",
    header: { type: "text", text: "Parte de Visita" },
    body: {
      text: `Complete sus datos para el parte de visita de ${params.direccion || params.propertyRef}.`,
    },
    footer: { text: "URUS Capital Group" },
    action: {
      name: "flow",
      parameters: {
        flow_message_version: "3",
        flow_id: FLOW_ID,
        flow_cta: "Completar parte de visita",
        flow_token: params.sessionId,
        flow_action: "navigate",
        flow_action_payload: {
          screen: "DATOS_INTERESADO",
          data: JSON.stringify({
            flow_token: params.sessionId,
            direccion_inmueble: params.direccion,
            tipo_operacion: params.tipoOperacion,
            precio_inmueble: precioFmt,
            agente_nombre: params.agenteName,
            fecha_visita: params.fechaVisita,
            hora_visita: params.horaVisita,
          }),
        },
      },
    },
  };

  return sendInteractiveMessage(to, interactive, {
    trace: buildFormularioTrace(to, params, "interactive"),
  });
}

// ---------------------------------------------------------------------------
// Documento firmado (dentro de ventana de 24h)
// ---------------------------------------------------------------------------

export async function sendParteVisitaDocumentoFirmado(
  to: string,
  params: {
    propertyRef: string;
    signedDocumentUrl: string;
    parteVisitaSessionId?: string;
  },
): Promise<SendMessageSuccess> {
  return sendDocumentMessage(
    to,
    {
      link: params.signedDocumentUrl,
      filename: `parte_visita_${params.propertyRef}_firmado.pdf`,
      caption:
        `✅ Aquí tiene su Parte de Visita firmado (ref: ${params.propertyRef}). ` +
        `Guarde este documento para sus registros. Gracias por confiar en URUS Capital Group.`,
    },
    {
      trace: {
        source: "parte_visita",
        kind: "parte_visita_documento_firmado",
        aggregateId: to,
        payload: {
          parteVisitaSessionId: params.parteVisitaSessionId ?? null,
          propertyRef: params.propertyRef,
          signedDocumentUrl: params.signedDocumentUrl,
        },
      },
    },
  );
}
