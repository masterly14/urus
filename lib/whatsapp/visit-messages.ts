/**
 * Funciones de envío WhatsApp para el flujo de agendamiento de visitas.
 *
 * Estrategia de canal (enfoque mixto):
 *
 * ┌─────────────────────────────┬──────────────────────────────────────────┐
 * │  Destino                    │  Tipo de mensaje                         │
 * ├─────────────────────────────┼──────────────────────────────────────────┤
 * │  → Comercial (siempre)      │  PLANTILLA (business-initiated)          │
 * │                             │  El comercial NO inicia la conversación. │
 * │                             │  Para mensajes con botones dinámicos se  │
 * │                             │  envía plantilla + interactive en cadena.│
 * ├─────────────────────────────┼──────────────────────────────────────────┤
 * │  → Comprador (en ventana)   │  INTERACTIVE / TEXTO LIBRE               │
 * │    - Propuesta de horario   │  El comprador acaba de interactuar.      │
 * │    - Pedir preferencia      │                                          │
 * │    - Recoger datos          │                                          │
 * ├─────────────────────────────┼──────────────────────────────────────────┤
 * │  → Comprador (fuera ventana)│  PLANTILLA (puede haberse pasado 24h)    │
 * │    - Confirmación visita    │  Confirmación/cancelación pueden llegar   │
 * │    - Escalado               │  tras tiempo de espera del comercial.    │
 * │    - Cancelación            │                                          │
 * └─────────────────────────────┴──────────────────────────────────────────┘
 */

import {
  sendTextMessage,
  sendTemplateMessage,
  sendInteractiveMessage,
  shouldSendWhatsAppToCommercials,
} from "./send";
import type {
  TemplateObject,
  InteractiveObject,
  SendMessageSuccess,
} from "./types";

type BaseOptions = { contextMessageId?: string };

const LANG = process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "es";

function tpl(envKey: string, fallback: string): string {
  return process.env[envKey]?.trim() || fallback;
}

// =========================================================================
// AL COMERCIAL — SIEMPRE PLANTILLA
// =========================================================================

// ---------------------------------------------------------------------------
// 1. sendVisitProposalToCommercial
// ---------------------------------------------------------------------------

export interface VisitProposalToCommercialData {
  sessionId: string;
  propertyRef: string;
  propertyTitle: string;
  propertyAddress: string;
  propertyPrice: number;
  propertyCiudad: string;
  propertyZona: string;
  propertyHabitaciones: number;
  propertyMetros: number;
  buyerWaId: string;
  slots: { id: string; label: string }[];
  round: number;
  /** Etiqueta del slot rechazado por el comprador (para mostrar contexto en ronda > 1). */
  rejectedSlotLabel?: string;
}

/**
 * Envía al comercial la propuesta de visita con hasta 3 slots.
 *
 * Dos mensajes en cadena:
 * 1. Plantilla con datos de propiedad + slots numerados (abre ventana 24h).
 * 2. Mensaje interactivo con reply buttons dinámicos (ya dentro de ventana).
 *
 * Devuelve el resultado del mensaje interactivo (el que lleva los botones).
 */
export async function sendVisitProposalToCommercial(
  comercialWaId: string,
  data: VisitProposalToCommercialData,
  options?: BaseOptions,
): Promise<SendMessageSuccess> {
  if (!shouldSendWhatsAppToCommercials()) {
    return { messages: [{ id: `wamid.skipped_commercial_${Date.now()}` }] } as SendMessageSuccess;
  }
  const priceFormatted = new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(data.propertyPrice);

  const slotsText = data.slots
    .map((s, i) => `${i + 1}️⃣ ${s.label}`)
    .join("\n");

  // 1. Plantilla — abre la ventana de conversación
  const template: TemplateObject = {
    name: tpl(
      "WHATSAPP_TEMPLATE_VISITA_PROPUESTA_SLOTS",
      "visita_propuesta_slots",
    ),
    language: { code: LANG },
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: data.propertyTitle },
          { type: "text", text: data.propertyAddress },
          { type: "text", text: priceFormatted },
          {
            type: "text",
            text: `${data.propertyCiudad} — ${data.propertyZona}`,
          },
          {
            type: "text",
            text: `${data.propertyHabitaciones} hab · ${data.propertyMetros}m²`,
          },
          { type: "text", text: data.buyerWaId },
          { type: "text", text: slotsText },
        ],
      },
    ],
  };

  const tplResult = await sendTemplateMessage(comercialWaId, template, {
    contextMessageId: options?.contextMessageId,
  });
  const tplMsgId = tplResult.messages?.[0]?.id;

  // 2. Interactive — botones dinámicos (ya dentro de ventana)
  const buttons = data.slots.map((slot) => ({
    type: "reply" as const,
    reply: { id: slot.id, title: slot.label.slice(0, 20) },
  }));

  let interactiveBody: string;
  if (data.round > 1 && data.rejectedSlotLabel) {
    interactiveBody =
      `El comprador no pudo el ${data.rejectedSlotLabel}.\n` +
      `Selecciona otro horario (ronda ${data.round}):`;
  } else if (data.round > 1) {
    interactiveBody = `Selecciona el horario que mejor te convenga (ronda ${data.round}):`;
  } else {
    interactiveBody = "Selecciona el horario que mejor te convenga:";
  }

  const interactive: InteractiveObject = {
    type: "button",
    body: { text: interactiveBody },
    action: { buttons },
  };

  return sendInteractiveMessage(comercialWaId, interactive, {
    contextMessageId: tplMsgId,
  });
}

// ---------------------------------------------------------------------------
// 2. sendBuyerRejectionToCommercial
// ---------------------------------------------------------------------------

export interface BuyerRejectionToCommercialData {
  comercialName: string;
  buyerWaId: string;
  rejectedSlotLabel: string;
  propertyRef: string;
}

/**
 * Plantilla: notifica al comercial que el comprador rechazó el horario.
 * Variables: {{1}}=comercial, {{2}}=comprador, {{3}}=horario, {{4}}=ref
 */
export async function sendBuyerRejectionToCommercial(
  comercialWaId: string,
  data: BuyerRejectionToCommercialData,
  options?: BaseOptions,
): Promise<SendMessageSuccess> {
  if (!shouldSendWhatsAppToCommercials()) {
    return { messages: [{ id: `wamid.skipped_commercial_${Date.now()}` }] } as SendMessageSuccess;
  }
  const template: TemplateObject = {
    name: tpl(
      "WHATSAPP_TEMPLATE_VISITA_RECHAZO_COMPRADOR",
      "visita_rechazo_comprador",
    ),
    language: { code: LANG },
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: data.comercialName },
          { type: "text", text: data.buyerWaId },
          { type: "text", text: data.rejectedSlotLabel },
          { type: "text", text: data.propertyRef },
        ],
      },
    ],
  };

  return sendTemplateMessage(comercialWaId, template, {
    contextMessageId: options?.contextMessageId,
  });
}

// ---------------------------------------------------------------------------
// 3. sendBuyerPreferenceToCommercial
// ---------------------------------------------------------------------------

export interface BuyerPreferenceToCommercialData {
  sessionId: string;
  buyerWaId: string;
  preferredDateLabel: string;
  propertyRef: string;
  propertyTitle: string;
}

/**
 * Plantilla + interactive: informa la fecha preferida del comprador
 * al comercial con botones ✅ Confirmar / ❌ No puedo.
 *
 * Igual que la propuesta de slots: plantilla abre ventana, luego botones.
 */
export async function sendBuyerPreferenceToCommercial(
  comercialWaId: string,
  data: BuyerPreferenceToCommercialData,
  options?: BaseOptions,
): Promise<SendMessageSuccess> {
  if (!shouldSendWhatsAppToCommercials()) {
    return { messages: [{ id: `wamid.skipped_commercial_${Date.now()}` }] } as SendMessageSuccess;
  }
  const template: TemplateObject = {
    name: tpl(
      "WHATSAPP_TEMPLATE_VISITA_CONFIRMAR_FECHA",
      "visita_confirmar_fecha_comprador",
    ),
    language: { code: LANG },
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: data.propertyTitle },
          { type: "text", text: data.propertyRef },
          { type: "text", text: data.buyerWaId },
          { type: "text", text: data.preferredDateLabel },
        ],
      },
    ],
  };

  const tplResult = await sendTemplateMessage(comercialWaId, template, {
    contextMessageId: options?.contextMessageId,
  });
  const tplMsgId = tplResult.messages?.[0]?.id;

  const interactive: InteractiveObject = {
    type: "button",
    body: { text: `¿Puedes el ${data.preferredDateLabel}?` },
    action: {
      buttons: [
        {
          type: "reply",
          reply: { id: `confirmar:${data.sessionId}`, title: "Confirmar" },
        },
        {
          type: "reply",
          reply: {
            id: `no_puedo_confirmar:${data.sessionId}`,
            title: "No puedo",
          },
        },
      ],
    },
  };

  return sendInteractiveMessage(comercialWaId, interactive, {
    contextMessageId: tplMsgId,
  });
}

// ---------------------------------------------------------------------------
// 4. sendEscalationToCommercial
// ---------------------------------------------------------------------------

export interface EscalationToCommercialData {
  comercialName: string;
  buyerWaId: string;
  propertyRef: string;
  propertyTitle: string;
  roundsAttempted: number;
  slotsAttempted: string[];
  buyerPreferredDate?: string;
  reason: string;
}

/**
 * Plantilla `visita_escalado_manual`: escalado a asignación manual.
 * Variables (6): {{1}}=comercial, {{2}}=propiedad, {{3}}=comprador,
 *   {{4}}=motivo, {{5}}=horarios intentados, {{6}}=preferencia comprador
 */
export async function sendEscalationToCommercial(
  comercialWaId: string,
  data: EscalationToCommercialData,
  options?: BaseOptions,
): Promise<SendMessageSuccess> {
  if (!shouldSendWhatsAppToCommercials()) {
    return { messages: [{ id: `wamid.skipped_commercial_${Date.now()}` }] } as SendMessageSuccess;
  }
  const template: TemplateObject = {
    name: tpl(
      "WHATSAPP_TEMPLATE_VISITA_ESCALADO_MANUAL",
      "visita_escalado_manual",
    ),
    language: { code: LANG },
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: data.comercialName },
          { type: "text", text: `${data.propertyTitle} (${data.propertyRef})` },
          { type: "text", text: data.buyerWaId },
          { type: "text", text: data.reason },
          {
            type: "text",
            text: data.slotsAttempted.length > 0
              ? data.slotsAttempted.join(", ")
              : "ninguno",
          },
          {
            type: "text",
            text: data.buyerPreferredDate ?? "sin preferencia",
          },
        ],
      },
    ],
  };

  return sendTemplateMessage(comercialWaId, template, {
    contextMessageId: options?.contextMessageId,
  });
}

// ---------------------------------------------------------------------------
// 5. sendVisitConfirmedToCommercial
// ---------------------------------------------------------------------------

export interface VisitConfirmedToCommercialData {
  comercialName: string;
  propertyRef: string;
  propertyTitle: string;
  slotLabel: string;
  visitorName: string;
  visitorPhone: string;
  visitorCount?: number;
  calendarLink?: string;
}

/**
 * Plantilla: confirma al comercial la visita agendada.
 * Variables: {{1}}=comercial, {{2}}=ref, {{3}}=horario, {{4}}=visitante, {{5}}=teléfono
 */
export async function sendVisitConfirmedToCommercial(
  comercialWaId: string,
  data: VisitConfirmedToCommercialData,
  options?: BaseOptions,
): Promise<SendMessageSuccess> {
  if (!shouldSendWhatsAppToCommercials()) {
    return { messages: [{ id: `wamid.skipped_commercial_${Date.now()}` }] } as SendMessageSuccess;
  }
  const template: TemplateObject = {
    name: tpl(
      "WHATSAPP_TEMPLATE_VISITA_CONFIRMADA_COMERCIAL",
      "visita_confirmada_comercial",
    ),
    language: { code: LANG },
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: data.comercialName },
          { type: "text", text: `${data.propertyTitle} (${data.propertyRef})` },
          { type: "text", text: data.slotLabel },
          { type: "text", text: data.visitorName },
          { type: "text", text: data.visitorPhone },
        ],
      },
    ],
  };

  return sendTemplateMessage(comercialWaId, template, {
    contextMessageId: options?.contextMessageId,
  });
}

// =========================================================================
// AL COMPRADOR — DENTRO DE VENTANA 24h (interactive / texto libre)
// =========================================================================

// ---------------------------------------------------------------------------
// 6. sendSlotProposalToBuyer
// ---------------------------------------------------------------------------

export interface SlotProposalToBuyerData {
  sessionId: string;
  propertyTitle: string;
  propertyAddress: string;
  slotLabel: string;
  comercialName: string;
}

/**
 * Interactive: propone al comprador el horario seleccionado por el comercial.
 * Botones: ✅ Sí, me va bien / ❌ No puedo.
 *
 * Dentro de ventana: el comprador expresó interés recientemente.
 */
export async function sendSlotProposalToBuyer(
  buyerWaId: string,
  data: SlotProposalToBuyerData,
  options?: BaseOptions,
): Promise<SendMessageSuccess> {
  const bodyText = [
    `🏠 *Visita programada*`,
    ``,
    `Propiedad: *${data.propertyTitle}*`,
    `📍 ${data.propertyAddress}`,
    ``,
    `📅 *${data.slotLabel}*`,
    `Agente: ${data.comercialName}`,
    ``,
    `¿Te viene bien este horario?`,
  ].join("\n");

  const interactive: InteractiveObject = {
    type: "button",
    body: { text: bodyText },
    action: {
      buttons: [
        {
          type: "reply",
          reply: {
            id: `si_me_va:${data.sessionId}`,
            title: "Sí, me va bien",
          },
        },
        {
          type: "reply",
          reply: { id: `no_puedo:${data.sessionId}`, title: "No puedo" },
        },
      ],
    },
  };

  return sendInteractiveMessage(buyerWaId, interactive, {
    contextMessageId: options?.contextMessageId,
  });
}

// ---------------------------------------------------------------------------
// 7. sendAskPreferenceToBuyer
// ---------------------------------------------------------------------------

export interface AskPreferenceToBuyerData {
  propertyTitle: string;
  propertyRef: string;
  comercialName: string;
}

/**
 * Texto libre: pide al comprador un día/hora preferido.
 * Dentro de ventana: el comprador acaba de rechazar un horario.
 */
export async function sendAskPreferenceToBuyer(
  buyerWaId: string,
  data: AskPreferenceToBuyerData,
  options?: BaseOptions,
): Promise<SendMessageSuccess> {
  const bodyText = [
    `📅 *¿Qué día y hora te vendría bien?*`,
    ``,
    `No hemos encontrado un horario que te encaje para visitar *${data.propertyTitle}* (${data.propertyRef}).`,
    ``,
    `Indícame el día y hora que prefieras (lunes a sábado, de 9:00 a 14:00 o de 16:00 a 20:00) y lo verificaremos con ${data.comercialName}.`,
    ``,
    `Ejemplo: _"El martes 22 a las 10:00"_`,
  ].join("\n");

  return sendTextMessage(buyerWaId, bodyText, {
    contextMessageId: options?.contextMessageId,
  });
}

// ---------------------------------------------------------------------------
// 8. sendCollectDataRequest
// ---------------------------------------------------------------------------

export interface CollectDataRequestData {
  propertyTitle: string;
  slotLabel: string;
}

/**
 * Texto libre: pide nombre, teléfono y nº de asistentes al comprador.
 * Dentro de ventana: el comprador acaba de aceptar el horario.
 */
export async function sendCollectDataRequest(
  buyerWaId: string,
  data: CollectDataRequestData,
  options?: BaseOptions,
): Promise<SendMessageSuccess> {
  const bodyText = [
    `🎉 *¡Genial! Visita a ${data.propertyTitle} el ${data.slotLabel}*`,
    ``,
    `Para confirmar tu visita necesito:`,
    ``,
    `1️⃣ Tu nombre completo`,
    `2️⃣ Un teléfono de contacto para el día de la visita`,
    `3️⃣ ¿Cuántas personas asistirán? (opcional)`,
    ``,
    `Puedes responder todo en un solo mensaje, por ejemplo:`,
    `_"Juan García, 654 321 000, vamos 2 personas"_`,
  ].join("\n");

  return sendTextMessage(buyerWaId, bodyText, {
    contextMessageId: options?.contextMessageId,
  });
}

// =========================================================================
// AL COMPRADOR — POSIBLEMENTE FUERA DE VENTANA (plantilla)
// =========================================================================

// ---------------------------------------------------------------------------
// 9. sendVisitConfirmedToBuyer
// ---------------------------------------------------------------------------

export interface VisitConfirmedToBuyerData {
  propertyTitle: string;
  propertyAddress: string;
  slotLabel: string;
  comercialName: string;
  comercialPhone?: string;
}

/**
 * Plantilla: confirma al comprador la visita agendada.
 * Puede llegar tras un tiempo de espera (comercial → datos → calendario),
 * por lo que usamos plantilla para garantizar entrega.
 */
export async function sendVisitConfirmedToBuyer(
  buyerWaId: string,
  data: VisitConfirmedToBuyerData,
  options?: BaseOptions,
): Promise<SendMessageSuccess> {
  const template: TemplateObject = {
    name: tpl(
      "WHATSAPP_TEMPLATE_VISITA_CONFIRMADA_COMPRADOR",
      "visita_confirmada_comprador",
    ),
    language: { code: LANG },
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: data.propertyTitle },
          { type: "text", text: data.propertyAddress },
          { type: "text", text: data.slotLabel },
          { type: "text", text: data.comercialName },
        ],
      },
    ],
  };

  return sendTemplateMessage(buyerWaId, template, {
    contextMessageId: options?.contextMessageId,
  });
}

// ---------------------------------------------------------------------------
// 10. sendEscalationToBuyer
// ---------------------------------------------------------------------------

export interface EscalationToBuyerData {
  propertyTitle: string;
  propertyRef: string;
  comercialName: string;
}

/**
 * Plantilla: informa al comprador que el comercial lo contactará directamente.
 * Puede dispararse por timeout, fuera de ventana.
 */
export async function sendEscalationToBuyer(
  buyerWaId: string,
  data: EscalationToBuyerData,
  options?: BaseOptions,
): Promise<SendMessageSuccess> {
  const template: TemplateObject = {
    name: tpl(
      "WHATSAPP_TEMPLATE_VISITA_ESCALADO_COMPRADOR",
      "visita_escalado_comprador",
    ),
    language: { code: LANG },
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: data.propertyTitle },
          { type: "text", text: data.propertyRef },
          { type: "text", text: data.comercialName },
        ],
      },
    ],
  };

  return sendTemplateMessage(buyerWaId, template, {
    contextMessageId: options?.contextMessageId,
  });
}

// ---------------------------------------------------------------------------
// 11. sendVisitCancelledToBuyer
// ---------------------------------------------------------------------------

export interface VisitCancelledToBuyerData {
  propertyTitle: string;
  propertyRef: string;
  slotLabel: string;
}

/**
 * Plantilla: informa al comprador que la visita ha sido cancelada.
 * Puede ocurrir en cualquier momento.
 */
export async function sendVisitCancelledToBuyer(
  buyerWaId: string,
  data: VisitCancelledToBuyerData,
  options?: BaseOptions,
): Promise<SendMessageSuccess> {
  const template: TemplateObject = {
    name: tpl(
      "WHATSAPP_TEMPLATE_VISITA_CANCELADA",
      "visita_cancelada_comprador",
    ),
    language: { code: LANG },
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: data.propertyTitle },
          { type: "text", text: data.propertyRef },
          { type: "text", text: data.slotLabel },
        ],
      },
    ],
  };

  return sendTemplateMessage(buyerWaId, template, {
    contextMessageId: options?.contextMessageId,
  });
}
