import type { EventType } from "@prisma/client";
import type {
  ConversationDirection,
  ConversationMessage,
  ConversationMessageKind,
} from "./types";

type NormalizableEvent = {
  id: string;
  position: bigint;
  type: EventType;
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
    explicit === "document"
  ) {
    return explicit;
  }
  if (payload.template) return "template";
  if (payload.interactive) return "interactive";
  if (payload.button) return "button";
  if (payload.document) return "document";
  if (payload.body || payload.text) return "text";
  return "unknown";
}

export function normalizeConversationEvent(event: NormalizableEvent): ConversationMessage | null {
  if (event.type !== "WHATSAPP_RECIBIDO" && event.type !== "WHATSAPP_ENVIADO") {
    return null;
  }

  const payload = asRecord(event.payload);
  const metadata = asRecord(event.metadata);
  const direction: ConversationDirection =
    event.type === "WHATSAPP_RECIBIDO" ? "inbound" : "outbound";
  const kind = inferKind(payload);
  const textObject = asRecord(payload.text);
  const document = asRecord(payload.document);
  const text =
    firstString(
      textObject.body,
      payload.body,
      payload.text,
      extractInteractiveText(payload),
      extractTemplateText(payload),
      document.caption,
      document.filename,
      payload.kind,
    ) ?? "[Mensaje sin texto visible]";

  const messageId = firstString(payload.messageId, payload.waMessageId, metadata.waMessageId);
  const source = firstString(payload.source, metadata.source);

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

