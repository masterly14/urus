import { Document, type Paragraph } from "docx";
import type { ContractTemplateInput } from "@/types/contracts";
import type { TemplateBlock, TemplateStructure } from "@/types/contract-template";
import type { AdditionalClausesDoc } from "@/lib/contracts/additional-clauses/types";
import { buildLogoHeaderParagraphs } from "@/lib/contracts/docx/blocks/logo-header";
import {
  additionalClausesNumberingConfig,
  buildAdditionalClausesParagraphs,
} from "@/lib/contracts/additional-clauses/docx-serializer";
import { resolveVariablesInText, resolveVariableList } from "./variable-resolver";
import { evaluateCondition } from "./conditional-evaluator";
import { blockToDocxParagraphs } from "./block-to-docx";

export interface CompileTemplateOptions {
  additionalClausesDoc?: AdditionalClausesDoc | null;
  sharedClauseOverrides?: Record<string, string | null> | null;
}

function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function resolveBlocks(
  blocks: TemplateBlock[],
  payload: Record<string, unknown>,
): TemplateBlock[] {
  const resolved: TemplateBlock[] = [];

  for (const block of blocks) {
    if (block.type === "conditional_block" && block.config.type === "conditional_block") {
      const innerBlocks = evaluateCondition(block.config.condition, payload);
      resolved.push(...resolveBlocks(innerBlocks, payload));
      continue;
    }

    if (block.type === "variable_list" && block.config.type === "variable_list") {
      const { sourcePath, itemTemplate, separator } = block.config.list;
      const items = getNestedValue(payload, sourcePath);
      if (Array.isArray(items) && items.length > 0) {
        const text = resolveVariableList(items, itemTemplate, separator);
        resolved.push({
          ...block,
          type: "body_paragraph",
          content: text,
          config: { type: "body_paragraph" },
        });
      }
      continue;
    }

    resolved.push({
      ...block,
      content: resolveVariablesInText(block.content, payload),
    });
  }

  return resolved;
}

export async function compileTemplate(
  structure: TemplateStructure,
  input: ContractTemplateInput,
  options: CompileTemplateOptions = {},
): Promise<Document> {
  const payload = input.payload as unknown as Record<string, unknown>;
  const resolvedBlocks = resolveBlocks(structure.blocks, payload);

  const logoHeader = await buildLogoHeaderParagraphs();
  const children: Paragraph[] = [...logoHeader];

  const jurisdictionMunicipality =
    (getNestedValue(payload, "jurisdiction.courtsMunicipality") as string) ?? "Madrid";

  let additionalClausesInserted = false;

  for (const block of resolvedBlocks) {
    if (block.type === "logo_header") continue;

    if (block.type === "additional_clauses_slot") {
      const clauses = buildAdditionalClausesParagraphs(
        options.additionalClausesDoc ?? null,
      );
      children.push(...clauses);
      additionalClausesInserted = true;
      continue;
    }

    const paragraphs = blockToDocxParagraphs(
      block,
      options.sharedClauseOverrides,
      jurisdictionMunicipality,
    );
    children.push(...paragraphs);
  }

  if (!additionalClausesInserted) {
    const clauses = buildAdditionalClausesParagraphs(
      options.additionalClausesDoc ?? null,
    );
    children.push(...clauses);
  }

  return new Document({
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 24 },
          paragraph: { spacing: { after: 140, line: 360 } },
        },
      },
    },
    numbering: additionalClausesNumberingConfig,
    sections: [{ properties: {}, children }],
  });
}
