import { describe, expect, it } from "vitest";
import { Packer, Document } from "docx";
import JSZip from "jszip";
import { buildSectionAddendumParagraphs } from "../docx-serializer";
import {
  filterAddendumsBySection,
  isSectionAddendumsListEmpty,
  type SectionAddendumsList,
} from "../types";

async function renderXml(list: SectionAddendumsList, sectionId: string): Promise<string> {
  const paragraphs = buildSectionAddendumParagraphs(list, sectionId);
  const doc = new Document({
    sections: [{ properties: {}, children: paragraphs }],
  });
  const buffer = await Packer.toBuffer(doc);
  const zip = await JSZip.loadAsync(buffer);
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error("word/document.xml no encontrado");
  return entry.async("string");
}

describe("buildSectionAddendumParagraphs", () => {
  it("devuelve array vacío cuando no hay addendums para la sección", () => {
    const list: SectionAddendumsList = [];
    expect(buildSectionAddendumParagraphs(list, "property")).toEqual([]);
  });

  it("ignora addendums de otras secciones", async () => {
    const list: SectionAddendumsList = [
      {
        id: "a1",
        sectionId: "parties",
        type: "notes",
        contentDoc: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Texto en REUNIDOS" }] },
          ],
        },
      },
    ];
    const xml = await renderXml(list, "property");
    expect(xml).not.toContain("Texto en REUNIDOS");
  });

  it("renderiza solo el contenido del addendum (sin etiqueta de tipo)", async () => {
    const list: SectionAddendumsList = [
      {
        id: "a1",
        sectionId: "property",
        type: "registry_extra",
        contentDoc: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Plaza de garaje numero 12, vinculada a la finca." },
              ],
            },
          ],
        },
      },
    ];
    const xml = await renderXml(list, "property");
    expect(xml).not.toContain("Datos registrales adicionales:");
    expect(xml).toContain("Plaza de garaje numero 12");
  });

  it("concatena varios addendums de la misma sección preservando el orden", async () => {
    const list: SectionAddendumsList = [
      {
        id: "a1",
        sectionId: "property",
        type: "extended_description",
        contentDoc: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Primer detalle." }] },
          ],
        },
      },
      {
        id: "a2",
        sectionId: "property",
        type: "annexes",
        contentDoc: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Segundo detalle." }] },
          ],
        },
      },
    ];
    const xml = await renderXml(list, "property");
    const firstIdx = xml.indexOf("Primer detalle");
    const secondIdx = xml.indexOf("Segundo detalle");
    expect(firstIdx).toBeGreaterThan(0);
    expect(secondIdx).toBeGreaterThan(firstIdx);
    expect(xml).not.toContain("Descripción ampliada:");
    expect(xml).not.toContain("Anejos:");
  });

  it("omite addendums vacíos sin tirar el render", async () => {
    const list: SectionAddendumsList = [
      {
        id: "a1",
        sectionId: "property",
        type: "notes",
        contentDoc: { type: "doc", content: [{ type: "paragraph" }] },
      },
    ];
    expect(buildSectionAddendumParagraphs(list, "property")).toEqual([]);
  });
});

describe("isSectionAddendumsListEmpty", () => {
  it("true si la lista está vacía", () => {
    expect(isSectionAddendumsListEmpty([])).toBe(true);
    expect(isSectionAddendumsListEmpty(null)).toBe(true);
    expect(isSectionAddendumsListEmpty(undefined)).toBe(true);
  });

  it("true si todos los addendums están vacíos", () => {
    expect(
      isSectionAddendumsListEmpty([
        {
          id: "a",
          sectionId: "property",
          type: "notes",
          contentDoc: { type: "doc", content: [{ type: "paragraph" }] },
        },
      ]),
    ).toBe(true);
  });

  it("false si al menos uno tiene contenido", () => {
    expect(
      isSectionAddendumsListEmpty([
        {
          id: "a",
          sectionId: "property",
          type: "notes",
          contentDoc: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }],
          },
        },
      ]),
    ).toBe(false);
  });
});

describe("filterAddendumsBySection", () => {
  it("filtra por sectionId y descarta vacíos", () => {
    const result = filterAddendumsBySection(
      [
        {
          id: "a",
          sectionId: "property",
          type: "notes",
          contentDoc: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "ok" }] }],
          },
        },
        {
          id: "b",
          sectionId: "property",
          type: "notes",
          contentDoc: { type: "doc", content: [{ type: "paragraph" }] },
        },
        {
          id: "c",
          sectionId: "parties",
          type: "notes",
          contentDoc: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }],
          },
        },
      ],
      "property",
    );
    expect(result.map((r) => r.id)).toEqual(["a"]);
  });
});
