import {
  AlignmentType,
  HeadingLevel,
  LineRuleType,
  Paragraph,
  TextRun,
} from "docx";
import type { TemplateBlock } from "@/types/contract-template";
import type { SharedClauseBlockId } from "@/types/contracts";
import {
  buildGastosClause,
  buildCargasClause,
  buildEstadoInmuebleClause,
  buildFueroClause,
} from "@/lib/contracts/docx/blocks/shared";

const FONT = "Calibri";
const HEADING_COLOR = "1A365D";

const SHARED_CLAUSE_TEXT: Record<string, (ctx?: string) => string> = {
  gastos_itp_iva_plusvalia: () => buildGastosClause(),
  libre_cargas_cancelacion_propiedad: () => buildCargasClause(),
  libre_cargas_declaracion_vendedor: () => buildCargasClause(),
  estado_visitado_cuerpo_cierto: () => buildEstadoInmuebleClause(),
  fuero_jurisdiccion: (municipality?: string) => buildFueroClause(municipality ?? "Madrid"),
};

function headingParagraph(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 260, after: 140 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 24,
        font: FONT,
        color: HEADING_COLOR,
      }),
    ],
  });
}

function bodyParagraph(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 140, line: 360, lineRule: LineRuleType.AUTO },
    indent: { firstLine: 420 },
    alignment: AlignmentType.JUSTIFIED,
    children: [new TextRun({ text, size: 24, font: FONT })],
  });
}

function titleParagraph(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { after: 260 },
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({
        text,
        bold: true,
        color: HEADING_COLOR,
        size: 36,
        font: FONT,
      }),
    ],
  });
}

function signatureParagraph(labels: string[]): Paragraph {
  const line = labels.join("                               ");
  return new Paragraph({
    spacing: { before: 320, after: 140 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: line, size: 24, font: FONT })],
  });
}

export function blockToDocxParagraphs(
  block: TemplateBlock,
  overrides?: Record<string, string | null> | null,
  jurisdictionMunicipality?: string,
): Paragraph[] {
  switch (block.type) {
    case "title":
      return [titleParagraph(block.content)];

    case "heading":
      return [headingParagraph(block.content)];

    case "body_paragraph":
      if (!block.content.trim()) return [];
      return [bodyParagraph(block.content)];

    case "shared_clause": {
      if (block.config.type !== "shared_clause") return [];
      const { clauseId, enabled, overrideText } = block.config.clause;
      if (!enabled) return [];

      const overrideFromTemplate = overrides?.[clauseId];
      const text =
        overrideText ??
        overrideFromTemplate ??
        (clauseId === "fuero_jurisdiccion"
          ? SHARED_CLAUSE_TEXT[clauseId]?.(jurisdictionMunicipality)
          : SHARED_CLAUSE_TEXT[clauseId]?.()) ??
        `[Clausula: ${clauseId}]`;

      return [bodyParagraph(text)];
    }

    case "signature_block": {
      const labels =
        block.config.type === "signature_block"
          ? block.config.labels
          : ["PARTE A", "PARTE B"];
      return [signatureParagraph(labels)];
    }

    case "logo_header":
    case "additional_clauses_slot":
      return [];

    default:
      return [];
  }
}
