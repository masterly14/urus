import { describe, expect, it } from "vitest";
import { normalizeConversationEvent, previewText } from "../normalize";

function event(overrides: Partial<Parameters<typeof normalizeConversationEvent>[0]>) {
  return {
    id: "evt_1",
    position: 1n,
    type: "WHATSAPP_RECIBIDO" as const,
    aggregateId: "34600000000",
    payload: {},
    metadata: null,
    correlationId: null,
    causationId: null,
    occurredAt: new Date("2026-04-27T10:00:00.000Z"),
    createdAt: new Date("2026-04-27T10:00:00.000Z"),
    ...overrides,
  };
}

describe("normalizeConversationEvent", () => {
  it("normaliza mensajes entrantes de texto", () => {
    const message = normalizeConversationEvent(
      event({
        payload: {
          messageId: "wamid.in",
          profileName: "Cliente Test",
          text: { body: "Hola, me interesa la vivienda" },
        },
      }),
    );

    expect(message).toMatchObject({
      direction: "inbound",
      kind: "text",
      text: "Hola, me interesa la vivienda",
      messageId: "wamid.in",
      waId: "34600000000",
    });
  });

  it("normaliza salientes de agente con body", () => {
    const message = normalizeConversationEvent(
      event({
        type: "WHATSAPP_ENVIADO",
        payload: {
          body: "Perfecto, te preparo más opciones.",
          source: "conversational_agent",
          messageId: "wamid.out",
        },
      }),
    );

    expect(message).toMatchObject({
      direction: "outbound",
      kind: "text",
      text: "Perfecto, te preparo más opciones.",
      source: "conversational_agent",
      messageId: "wamid.out",
    });
  });

  it("extrae una vista legible de plantillas", () => {
    const message = normalizeConversationEvent(
      event({
        type: "WHATSAPP_ENVIADO",
        payload: {
          messageType: "template",
          template: {
            name: "postventa_resena",
            components: [
              {
                type: "body",
                parameters: [
                  { type: "text", text: "Ana" },
                  { type: "text", text: "https://reviews.example" },
                ],
              },
            ],
          },
        },
      }),
    );

    expect(message?.kind).toBe("template");
    expect(message?.text).toContain("postventa_resena");
    expect(message?.text).toContain("Ana");
  });

  it("ignora eventos que no son de conversacion WhatsApp", () => {
    const message = normalizeConversationEvent(
      event({
        type: "DEMANDA_ACTUALIZADA",
        payload: { body: "no aplica" },
      }),
    );

    expect(message).toBeNull();
  });
});

describe("previewText", () => {
  it("compacta espacios y recorta textos largos", () => {
    expect(previewText("Hola\n\n   mundo", 20)).toBe("Hola mundo");
    expect(previewText("1234567890", 8)).toBe("12345...");
  });
});

