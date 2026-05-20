import { describe, expect, it } from "vitest";
import { Packer, Document } from "docx";
import JSZip from "jszip";
import {
  additionalClausesNumberingConfig,
  buildAdditionalClausesParagraphs,
} from "../docx-serializer";
import type { AdditionalClausesDoc } from "../types";

/**
 * El serializer emite `Paragraph` (no un docx completo). Para verificar
 * que lo que produce realmente es válido y llega al archivo final,
 * empaquetamos un `Document` mínimo y extraemos `word/document.xml` del
 * zip resultante para hacer asserts legibles sobre el OOXML real.
 */
async function renderDocumentXml(doc: AdditionalClausesDoc | null): Promise<string> {
  const paragraphs = buildAdditionalClausesParagraphs(doc);
  const document = new Document({
    numbering: additionalClausesNumberingConfig,
    sections: [{ properties: {}, children: paragraphs }],
  });
  const buffer = await Packer.toBuffer(document);
  const zip = await JSZip.loadAsync(buffer);
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error("word/document.xml no encontrado en el docx");
  return await entry.async("string");
}

describe("buildAdditionalClausesParagraphs", () => {
  it("devuelve array vacío para doc nulo", () => {
    expect(buildAdditionalClausesParagraphs(null)).toEqual([]);
  });

  it("devuelve array vacío para doc con un párrafo vacío", () => {
    const doc: AdditionalClausesDoc = {
      type: "doc",
      content: [{ type: "paragraph" }],
    };
    expect(buildAdditionalClausesParagraphs(doc)).toEqual([]);
  });

  it("incluye la cláusula numerada y el texto cuando hay contenido", async () => {
    const doc: AdditionalClausesDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "CLAUSULA 8.- LIMPIEZA", marks: [{ type: "bold" }] }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Pacto especial de " },
            { type: "text", text: "limpieza", marks: [{ type: "bold" }] },
            { type: "text", text: " antes de escritura." },
          ],
        },
      ],
    };

    const paragraphs = buildAdditionalClausesParagraphs(doc);
    expect(paragraphs.length).toBeGreaterThan(0);

    const xml = await renderDocumentXml(doc);
    expect(xml).toContain("CLAUSULA 8.- LIMPIEZA");
    expect(xml).toContain("Pacto especial de");
    expect(xml).toContain("limpieza");
    expect(xml).toContain("antes de escritura.");
  });

  it("mapea tamaño L al half-point 32 en el run", async () => {
    const doc: AdditionalClausesDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "AVISO IMPORTANTE",
              marks: [{ type: "fontSize", attrs: { size: "L" } }],
            },
          ],
        },
      ],
    };
    const xml = await renderDocumentXml(doc);
    expect(xml).toContain("AVISO IMPORTANTE");
    // `w:sz w:val="32"` es la marca interna de half-points en OOXML.
    expect(xml).toMatch(/w:val="32"/);
  });

  it("serializa listas con viñetas y numeradas", async () => {
    const doc: AdditionalClausesDoc = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Incluye nevera" }],
                },
              ],
            },
          ],
        },
        {
          type: "orderedList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Primera entrega 1000€" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Segunda entrega 2000€" }],
                },
              ],
            },
          ],
        },
      ],
    };
    const xml = await renderDocumentXml(doc);
    expect(xml).toContain("Incluye nevera");
    expect(xml).toContain("Primera entrega");
    expect(xml).toContain("Segunda entrega");

    // docx resuelve `reference` a un numId interno. Verificamos que hay
    // tres referencias a numeración (1 viñeta + 2 ordenadas) y que los
    // dos numId son distintos (separación lógica entre bulletList/orderedList).
    const numIds = Array.from(xml.matchAll(/<w:numId\s+w:val="(\d+)"/g)).map((m) => m[1]);
    expect(numIds).toHaveLength(3);
    const uniqueNumIds = new Set(numIds);
    expect(uniqueNumIds.size).toBe(2);
  });
});
