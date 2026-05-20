import {
  AlignmentType,
  LevelFormat,
  LineRuleType,
  Paragraph,
  TextRun,
  type ISectionOptions,
} from "docx";
import {
  ADDITIONAL_CLAUSES_FONT_SIZE_HALFPOINTS,
  isAdditionalClausesDocEmpty,
  type AdditionalClauseBlock,
  type AdditionalClauseFontSize,
  type AdditionalClauseParagraph,
  type AdditionalClauseTextNode,
  type AdditionalClausesDoc,
} from "./types";

/**
 * Convierte el JSON TipTap de cláusulas adicionales a Paragraphs de la
 * librería `docx`, reutilizando los mismos tokens tipográficos (Calibri,
 * color `1A365D` en encabezados, half-points) que usan los builders de
 * arras/señal/oferta-firme.
 *
 * El objetivo es que las cláusulas adicionales se vean coherentes con
 * el resto del contrato en el PDF final, no "pegadas" o con otro look.
 */

const FONT = "Calibri";
const DEFAULT_BODY_SIZE = ADDITIONAL_CLAUSES_FONT_SIZE_HALFPOINTS.M;

export function buildAdditionalClausesParagraphs(
  doc: AdditionalClausesDoc | null | undefined,
): Paragraph[] {
  if (isAdditionalClausesDocEmpty(doc)) {
    return [];
  }
  const paragraphs: Paragraph[] = [];

  for (const block of doc!.content ?? []) {
    paragraphs.push(...serializeBlock(block));
  }

  return paragraphs;
}

function serializeBlock(block: AdditionalClauseBlock): Paragraph[] {
  switch (block.type) {
    case "paragraph":
      return [serializeParagraph(block)];
    case "bulletList":
      return (block.content ?? []).flatMap((item) =>
        (item.content ?? []).map((p) =>
          serializeParagraph(p, { bullet: { level: 0 } }),
        ),
      );
    case "orderedList":
      return (block.content ?? []).flatMap((item) =>
        (item.content ?? []).map((p) =>
          serializeParagraph(p, {
            numbering: { reference: "additional-clauses-ol", level: 0 },
          }),
        ),
      );
  }
}

type ParagraphBulletOrNumbering =
  | { bullet: { level: number } }
  | { numbering: { reference: string; level: number } }
  | Record<string, never>;

function serializeParagraph(
  paragraph: AdditionalClauseParagraph,
  listOptions: ParagraphBulletOrNumbering = {},
): Paragraph {
  const runs = (paragraph.content ?? [])
    .filter((node) => node.type === "text")
    .map(serializeTextRun);

  const hasAnyText = runs.length > 0;
  const hasListMarker = "bullet" in listOptions || "numbering" in listOptions;

  return new Paragraph({
    spacing: { after: 140, line: 360, lineRule: LineRuleType.AUTO },
    alignment: hasListMarker ? AlignmentType.LEFT : AlignmentType.JUSTIFIED,
    indent: hasListMarker ? undefined : { firstLine: 420 },
    ...listOptions,
    children: hasAnyText
      ? runs
      : [new TextRun({ text: "", size: DEFAULT_BODY_SIZE, font: FONT })],
  });
}

function serializeTextRun(node: AdditionalClauseTextNode): TextRun {
  const marks = node.marks ?? [];
  const isBold = marks.some((m) => m.type === "bold");
  const isItalic = marks.some((m) => m.type === "italic");
  const fontSizeMark = marks.find((m) => m.type === "fontSize") as
    | { type: "fontSize"; attrs: { size: AdditionalClauseFontSize } }
    | undefined;
  const size = fontSizeMark
    ? ADDITIONAL_CLAUSES_FONT_SIZE_HALFPOINTS[fontSizeMark.attrs.size]
    : DEFAULT_BODY_SIZE;

  return new TextRun({
    text: node.text,
    bold: isBold || undefined,
    italics: isItalic || undefined,
    size,
    font: FONT,
  });
}

/**
 * Numbering config que hay que inyectar a `new Document({ numbering })`
 * cuando el doc contiene listas ordenadas. Exportado para que los builders
 * lo compongan con su configuración existente.
 */
export const additionalClausesNumberingConfig: NonNullable<
  NonNullable<ConstructorParameters<typeof import("docx").Document>[0]>["numbering"]
> = {
  config: [
    {
      reference: "additional-clauses-ol",
      levels: [
        {
          level: 0,
          format: LevelFormat.DECIMAL,
          text: "%1.",
          alignment: AlignmentType.START,
          style: {
            paragraph: { indent: { left: 720, hanging: 360 } },
          },
        },
      ],
    },
  ],
};

/** Solo para uso en tests: aísla el uso del builder del resto del doc. */
export function _buildAdditionalClausesSectionForTests(
  doc: AdditionalClausesDoc | null,
): ISectionOptions {
  return {
    properties: {},
    children: buildAdditionalClausesParagraphs(doc),
  };
}
