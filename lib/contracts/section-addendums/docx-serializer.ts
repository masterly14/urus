import { AlignmentType, LineRuleType, Paragraph, TextRun } from "docx";
import { buildAdditionalClausesParagraphs } from "@/lib/contracts/additional-clauses/docx-serializer";
import {
  filterAddendumsBySection,
  type SectionAddendumsList,
} from "./types";

/**
 * Convierte los addendums de una sección concreta a párrafos DOCX listos
 * para insertarse JUSTO ANTES del cierre de esa sección en el builder.
 *
 * Diseño:
 * - El cuerpo reutiliza `buildAdditionalClausesParagraphs`, ya validado
 *   para mantener fuente, espaciado e indentación coherentes con el resto.
 * - Se separan los addendums con una línea en blanco pequeña para que el
 *   lector distinga visualmente dónde acaba uno y empieza el siguiente.
 */

const FONT = "Calibri";

export function buildSectionAddendumParagraphs(
  list: SectionAddendumsList | null | undefined,
  sectionId: string,
): Paragraph[] {
  const addendums = filterAddendumsBySection(list, sectionId);
  if (addendums.length === 0) return [];

  const paragraphs: Paragraph[] = [];

  for (let i = 0; i < addendums.length; i++) {
    const addendum = addendums[i];
    paragraphs.push(...buildAdditionalClausesParagraphs(addendum.contentDoc));
    if (i < addendums.length - 1) {
      paragraphs.push(buildSpacerParagraph());
    }
  }

  return paragraphs;
}

function buildSpacerParagraph(): Paragraph {
  return new Paragraph({
    spacing: { before: 0, after: 80 },
    children: [new TextRun({ text: "", size: 20, font: FONT })],
  });
}
