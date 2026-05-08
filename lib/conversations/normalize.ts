import type { AggregateType, EventType } from "@prisma/client";
import type {
  ConversationDirection,
  ConversationMessage,
  ConversationMessageKind,
} from "./types";

type NormalizableEvent = {
  id: string;
  position: bigint;
  type: EventType;
  aggregateType: AggregateType;
  aggregateId: string;
  payload: unknown;
  metadata: unknown;
  correlationId: string | null;
  causationId: string | null;
  occurredAt: Date;
  createdAt: Date;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const s = stringValue(value);
    if (s) return s;
  }
  return null;
}

function extractTemplateText(payload: Record<string, unknown>): string | null {
  const template = asRecord(payload.template);
  const name = stringValue(template.name);
  const components = Array.isArray(template.components) ? template.components : [];
  const variables = components.flatMap((component) => {
    const c = asRecord(component);
    const params = Array.isArray(c.parameters) ? c.parameters : [];
    return params
      .map((param) => stringValue(asRecord(param).text))
      .filter((value): value is string => Boolean(value));
  });

  if (!name && variables.length === 0) return null;
  if (variables.length === 0) return name ? `Plantilla: ${name}` : null;
  return `Plantilla: ${name ?? "sin nombre"} (${variables.join(" · ")})`;
}

function extractLegacySentText(payload: Record<string, unknown>): string | null {
  const kind = stringValue(payload.kind);
  if (!kind) return null;

  if (kind === "microsite_link") {
    const buyerUrl = stringValue(payload.buyerUrl);
    return [
      "Aquí tienes una selección de propiedades que encajan con tu búsqueda:",
      buyerUrl,
    ].filter(Boolean).join("\n");
  }

  if (kind === "match_notification") {
    const link = stringValue(payload.enlacePropiedad);
    return [
      "Te hemos enviado una propiedad que puede encajar con tu búsqueda.",
      link,
    ].filter(Boolean).join("\n");
  }

  if (kind === "no_stock_available") {
    const currentSelectionUrl = stringValue(payload.currentSelectionUrl);
    if (currentSelectionUrl) {
      return [
        "De momento no he encontrado opciones nuevas que encajen con tus criterios.",
        "Mientras tanto, puedes revisar de nuevo la selección actual:",
        currentSelectionUrl,
      ].join("\n");
    }
    return "De momento no he encontrado propiedades que encajen con tus criterios. Si quieres, dime por aquí con qué margen podemos movernos y vuelvo a buscar.";
  }

  return `[Enviado: ${kind}]`;
}

function extractMediaText(payload: Record<string, unknown>): string | null {
  const image = asRecord(payload.image);
  const document = asRecord(payload.document);

  const imageCaption = stringValue(image.caption);
  const imageLink = firstString(image.link, image.id, payload.link, payload.id);
  const documentCaption = stringValue(document.caption);
  const documentFilename = stringValue(document.filename);
  const documentRef = firstString(document.link, document.id);

  if (imageCaption) return imageCaption;
  if (documentCaption) return documentCaption;
  if (documentFilename) return `Documento: ${documentFilename}`;
  if (imageLink) return `Imagen adjunta: ${imageLink}`;
  if (documentRef) return `Documento adjunto: ${documentRef}`;

  return null;
}

function extractInteractiveText(payload: Record<string, unknown>): string | null {
  const interactive = asRecord(payload.interactive);
  const body = asRecord(interactive.body);
  const buttonReply = asRecord(interactive.button_reply);
  const listReply = asRecord(interactive.list_reply);
  const nfmReply = asRecord(interactive.nfm_reply);

  return firstString(
    body.text,
    buttonReply.title,
    listReply.title,
    asRecord(payload.interactive).title,
    asRecord(payload.button).text,
    nfmReply.name,
  );
}

function inferKind(payload: Record<string, unknown>): ConversationMessageKind {
  const explicit = stringValue(payload.messageType) ?? stringValue(payload.type);
  if (
    explicit === "text" ||
    explicit === "template" ||
    explicit === "interactive" ||
    explicit === "button" ||
    explicit === "image" ||
    explicit === "document"
  ) {
    return explicit;
  }
  if (payload.template) return "template";
  if (payload.interactive) return "interactive";
  if (payload.button) return "button";
  if (payload.image) return "image";
  if (payload.document) return "document";
  if (payload.body || payload.text) return "text";
  return "unknown";
}

export function normalizeConversationEvent(event: NormalizableEvent): ConversationMessage | null {
  const isWhatsAppEvent =
    event.aggregateType === "WHATSAPP_CONVERSATION" &&
    (event.type === "WHATSAPP_RECIBIDO" || event.type === "WHATSAPP_ENVIADO");
  const isMentalHealthEvent =
    event.aggregateType === "MENTAL_CONVERSATION" &&
    (event.type === "MENTAL_MSG_RECIBIDO" || event.type === "MENTAL_MSG_ENVIADO");

  if (!isWhatsAppEvent && !isMentalHealthEvent) {
    return null;
  }

  const payload = asRecord(event.payload);
  if (
    event.type === "WHATSAPP_ENVIADO" &&
    (stringValue(payload.type) === "escalation_requested" ||
      stringValue(payload.kind) === "escalation_requested")
  ) {
    return null;
  }
  const metadata = asRecord(event.metadata);
  const direction: ConversationDirection =
    event.type === "WHATSAPP_RECIBIDO" || event.type === "MENTAL_MSG_RECIBIDO"
      ? "inbound"
      : "outbound";
  const kind = isMentalHealthEvent ? "text" : inferKind(payload);
  const textObject = asRecord(payload.text);
  const text =
    firstString(
      textObject.body,
      payload.body,
      payload.text,
      extractInteractiveText(payload),
      extractTemplateText(payload),
      extractMediaText(payload),
      extractLegacySentText(payload),
    ) ?? "[Mensaje sin texto visible]";

  const messageId = firstString(payload.messageId, payload.waMessageId, metadata.waMessageId);
  const source = isMentalHealthEvent
    ? firstString(payload.source, metadata.source) ?? "coach_mental"
    : firstString(payload.source, metadata.source);

  return {
    id: `${event.aggregateId}:${event.position.toString()}`,
    eventId: event.id,
    position: event.position.toString(),
    waId: event.aggregateId,
    direction,
    type: event.type,
    kind,
    text,
    occurredAt: event.occurredAt.toISOString(),
    createdAt: event.createdAt.toISOString(),
    source,
    messageId,
    correlationId: event.correlationId,
    causationId: event.causationId,
    metadata: event.metadata,
    rawPayload: event.payload,
  };
}

export function previewText(text: string, maxLength = 120): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  if (singleLine.length <= maxLength) return singleLine;
  return `${singleLine.slice(0, maxLength - 3)}...`;
}

