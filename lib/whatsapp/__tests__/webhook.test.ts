import { afterEach, describe, expect, it } from "vitest";
import { parseWebhookPayload } from "../webhook";

const BASE_PAYLOAD = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "981576107771610",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "15550690050",
              phone_number_id: "1034009133135314",
            },
            contacts: [{ wa_id: "573113541077", profile: { name: "Test User" } }],
            messages: [
              {
                from: "573113541077",
                id: "wamid.test",
                timestamp: "1779311951",
                type: "text",
                text: { body: "hola" },
              },
            ],
          },
        },
      ],
    },
  ],
} as const;

function clonePayload() {
  return JSON.parse(JSON.stringify(BASE_PAYLOAD)) as typeof BASE_PAYLOAD;
}

afterEach(() => {
  delete process.env.WHATSAPP_BUSINESS_ID;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
});

describe("parseWebhookPayload", () => {
  it("procesa eventos cuando entry.id y phone_number_id coinciden con env", () => {
    process.env.WHATSAPP_BUSINESS_ID = "981576107771610";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "1034009133135314";

    const events = parseWebhookPayload(clonePayload());

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "message",
      waId: "573113541077",
      phoneNumberId: "1034009133135314",
    });
  });

  it("ignora eventos cuando entry.id no coincide con WHATSAPP_BUSINESS_ID", () => {
    process.env.WHATSAPP_BUSINESS_ID = "otra-cuenta";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "1034009133135314";

    const events = parseWebhookPayload(clonePayload());

    expect(events).toHaveLength(0);
  });

  it("ignora eventos cuando phone_number_id no coincide con WHATSAPP_PHONE_NUMBER_ID", () => {
    process.env.WHATSAPP_BUSINESS_ID = "981576107771610";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "otro-phone-number-id";

    const events = parseWebhookPayload(clonePayload());

    expect(events).toHaveLength(0);
  });
});
