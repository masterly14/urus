import { describe, expect, it } from "vitest";
import type { ConversationMessage } from "@/lib/conversations/types";
import { dedupeConversationMessages } from "@/lib/conversations/queries";

function message(input: Partial<ConversationMessage> & Pick<ConversationMessage, "eventId" | "position">): ConversationMessage {
  return {
    id: input.eventId,
    eventId: input.eventId,
    position: input.position,
    waId: input.waId ?? "34677277324",
    direction: input.direction ?? "outbound",
    type: input.type ?? "WHATSAPP_ENVIADO",
    kind: input.kind ?? "text",
    text: input.text ?? "texto",
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    createdAt: input.createdAt ?? new Date().toISOString(),
    source: input.source ?? "whatsapp_send",
    messageId: input.messageId ?? null,
    correlationId: input.correlationId ?? null,
    causationId: input.causationId ?? null,
    metadata: input.metadata ?? null,
    rawPayload: input.rawPayload ?? null,
    templateRender: input.templateRender ?? null,
  };
}

describe("dedupeConversationMessages", () => {
  it("deduplica por waId+messageId en salientes duplicados", () => {
    const input = [
      message({
        eventId: "evt-1",
        position: "100",
        source: "whatsapp_send",
        messageId: "wamid.abc",
        text: "Te las paso en unos minutos",
      }),
      message({
        eventId: "evt-2",
        position: "101",
        source: "conversational_agent",
        messageId: "wamid.abc",
        text: "Te las paso en unos minutos",
      }),
    ];

    const output = dedupeConversationMessages(input);
    expect(output).toHaveLength(1);
    expect(output[0].messageId).toBe("wamid.abc");
    expect(output[0].source).toBe("conversational_agent");
  });

  it("no deduplica mensajes sin messageId", () => {
    const input = [
      message({
        eventId: "evt-1",
        position: "100",
        source: "whatsapp_send",
        messageId: null,
      }),
      message({
        eventId: "evt-2",
        position: "101",
        source: "conversational_agent",
        messageId: null,
      }),
    ];

    const output = dedupeConversationMessages(input);
    expect(output).toHaveLength(2);
  });

  it("no deduplica entrantes aunque coincida messageId", () => {
    const input = [
      message({
        eventId: "evt-in-1",
        position: "50",
        direction: "inbound",
        type: "WHATSAPP_RECIBIDO",
        source: null,
        messageId: "wamid.in.same",
      }),
      message({
        eventId: "evt-in-2",
        position: "51",
        direction: "inbound",
        type: "WHATSAPP_RECIBIDO",
        source: null,
        messageId: "wamid.in.same",
      }),
    ];

    const output = dedupeConversationMessages(input);
    expect(output).toHaveLength(2);
  });
});
