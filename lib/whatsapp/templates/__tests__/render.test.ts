import { describe, expect, it } from "vitest";
import { renderWhatsAppTemplate } from "../render";

describe("renderWhatsAppTemplate", () => {
  it("interpola variables de body y conserva detalle", () => {
    const render = renderWhatsAppTemplate(
      {
        name: "match",
        language: { code: "es" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "Ana" },
              { type: "text", text: "https://urus.test/seleccion/abc" },
            ],
          },
        ],
      },
      {
        name: "match",
        language: "es",
        status: "APPROVED",
        category: "MARKETING",
        components: [
          {
            type: "BODY",
            text: "Hola {{1}}, hemos preparado una selección para ti: {{2}}",
          },
        ],
      },
    );

    expect(render?.resolved).toBe(true);
    expect(render?.bodyText).toBe("Hola Ana, hemos preparado una selección para ti: https://urus.test/seleccion/abc");
    expect(render?.variables).toEqual([
      expect.objectContaining({ placeholder: "{{1}}", value: "Ana" }),
      expect.objectContaining({ placeholder: "{{2}}", value: "https://urus.test/seleccion/abc" }),
    ]);
  });

  it("interpola urls dinamicas de botones por index", () => {
    const render = renderWhatsAppTemplate(
      {
        name: "visita_confirmada",
        language: { code: "es" },
        components: [
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [{ type: "text", text: "evento-123" }],
          },
        ],
      },
      {
        name: "visita_confirmada",
        language: "es",
        status: "APPROVED",
        category: "UTILITY",
        components: [
          { type: "BODY", text: "Tu visita está confirmada." },
          {
            type: "BUTTONS",
            buttons: [
              {
                type: "URL",
                text: "Ver evento",
                url: "https://calendar.example/{{1}}",
              },
            ],
          },
        ],
      },
    );

    const buttons = render?.components.find((component) => component.type === "buttons")?.buttons;
    expect(buttons?.[0]).toMatchObject({
      text: "Ver evento",
      url: "https://calendar.example/evento-123",
    });
  });

  it("mantiene placeholders cuando faltan variables", () => {
    const render = renderWhatsAppTemplate(
      {
        name: "recordatorio",
        language: { code: "es" },
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: "Carlos" }],
          },
        ],
      },
      {
        name: "recordatorio",
        language: "es",
        status: "APPROVED",
        category: "UTILITY",
        components: [
          {
            type: "BODY",
            text: "Hola {{1}}, recuerda firmar {{2}}.",
          },
        ],
      },
    );

    expect(render?.bodyText).toBe("Hola Carlos, recuerda firmar {{2}}.");
  });

  it("devuelve fallback legible cuando no hay caché WABA", () => {
    const render = renderWhatsAppTemplate({
      name: "postventa_resena",
      language: { code: "es" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: "Lucía" },
            { type: "text", text: "https://reviews.example" },
          ],
        },
      ],
    });

    expect(render?.resolved).toBe(false);
    expect(render?.previewText).toBe("Plantilla: postventa_resena (Lucía · https://reviews.example)");
  });
});
