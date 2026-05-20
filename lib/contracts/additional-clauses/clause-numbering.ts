import type { ContractTemplateInput } from "@/types/contracts";
import type {
  AdditionalClauseBlock,
  AdditionalClauseParagraph,
  AdditionalClausesDoc,
} from "./types";

const CLAUSE_HEADING_REGEX = /^CLAUSULA\s+(\d+)\s*\.-/i;
const CLAUSE_HEADING_WITH_TITLE_REGEX = /^CLAUSULA\s+(\d+)\s*\.-\s*(.*)$/i;

function getParagraphText(paragraph: AdditionalClauseParagraph): string {
  return (paragraph.content ?? [])
    .filter((node) => node.type === "text")
    .map((node) => node.text)
    .join("")
    .trim();
}

function collectParagraphsFromBlock(
  block: AdditionalClauseBlock,
): AdditionalClauseParagraph[] {
  if (block.type === "paragraph") return [block];
  if (block.type === "bulletList" || block.type === "orderedList") {
    return (block.content ?? []).flatMap((item) => item.content ?? []);
  }
  return [];
}

export function extractMaxAdditionalClauseNumber(
  doc: AdditionalClausesDoc | null | undefined,
): number | null {
  if (!doc?.content || doc.content.length === 0) return null;

  let max: number | null = null;
  for (const block of doc.content) {
    const paragraphs = collectParagraphsFromBlock(block);
    for (const paragraph of paragraphs) {
      const text = getParagraphText(paragraph);
      const match = text.match(CLAUSE_HEADING_REGEX);
      if (!match) continue;
      const n = Number(match[1]);
      if (!Number.isFinite(n)) continue;
      max = max == null ? n : Math.max(max, n);
    }
  }

  return max;
}

export function getDefaultAdditionalClauseStartNumber(
  input: ContractTemplateInput,
): number {
  switch (input.kind) {
    case "arras":
      // Base del contrato: PRIMERA ... SEPTIMA
      return 8;
    case "oferta_firme":
      // Base del contrato: Primero ... Septimo
      return 8;
    case "senal_compra": {
      // Base: 8 o 9 según cláusula de financiación.
      const includeFinancing =
        input.payload.flags.includeFinancingFallbackClause === true;
      return includeFinancing ? 10 : 9;
    }
    default:
      return 1;
  }
}

export function getNextAdditionalClauseNumber(
  doc: AdditionalClausesDoc | null | undefined,
  startNumber: number,
): number {
  const safeStart = Number.isFinite(startNumber) && startNumber > 0
    ? Math.floor(startNumber)
    : 1;
  const max = extractMaxAdditionalClauseNumber(doc);
  if (max == null) return safeStart;
  return Math.max(max + 1, safeStart);
}

export function buildClauseHeadingText(number: number, title: string): string {
  const safeNumber = Number.isFinite(number) && number > 0
    ? Math.floor(number)
    : 1;
  const safeTitle = title.trim().toUpperCase() || "CLAUSULA ADICIONAL";
  return `CLAUSULA ${safeNumber}.- ${safeTitle}`;
}

export interface AdditionalClauseSegment {
  number: number;
  title: string;
  headingText: string;
  startBlockIndex: number;
  endBlockIndex: number;
}

function getHeadingDataFromBlock(block: AdditionalClauseBlock): {
  number: number;
  title: string;
  headingText: string;
} | null {
  if (block.type !== "paragraph") return null;
  const text = getParagraphText(block);
  const match = text.match(CLAUSE_HEADING_WITH_TITLE_REGEX);
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return null;
  return {
    number,
    title: (match[2] ?? "").trim(),
    headingText: text,
  };
}

export function listAdditionalClauseSegments(
  doc: AdditionalClausesDoc | null | undefined,
): AdditionalClauseSegment[] {
  const blocks = doc?.content ?? [];
  if (blocks.length === 0) return [];

  const headingIndexes: Array<{
    blockIndex: number;
    number: number;
    title: string;
    headingText: string;
  }> = [];

  for (let i = 0; i < blocks.length; i += 1) {
    const heading = getHeadingDataFromBlock(blocks[i]);
    if (!heading) continue;
    headingIndexes.push({ blockIndex: i, ...heading });
  }

  return headingIndexes.map((heading, idx) => {
    const next = headingIndexes[idx + 1];
    return {
      number: heading.number,
      title: heading.title,
      headingText: heading.headingText,
      startBlockIndex: heading.blockIndex,
      endBlockIndex: next ? next.blockIndex - 1 : blocks.length - 1,
    };
  });
}

export function removeAdditionalClauseByNumber(
  doc: AdditionalClausesDoc | null | undefined,
  clauseNumber: number,
): AdditionalClausesDoc | null {
  const blocks = doc?.content ?? [];
  if (blocks.length === 0) return null;

  const target = listAdditionalClauseSegments(doc).find((c) => c.number === clauseNumber);
  if (!target) return doc ?? null;

  const nextBlocks = blocks.filter(
    (_, idx) => idx < target.startBlockIndex || idx > target.endBlockIndex,
  );
  if (nextBlocks.length === 0) return null;

  return { type: "doc", content: nextBlocks };
}
