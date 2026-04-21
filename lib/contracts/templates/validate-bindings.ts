import type { ContractDocumentKind } from "@/types/contracts";
import type { TemplateBlock, TemplateStructure } from "@/types/contract-template";
import { getVariablesForKind } from "./variable-catalog";

export interface TemplateValidationIssue {
  type: "error" | "warning";
  message: string;
  blockId?: string;
}

const VARIABLE_REGEX = /\{\{([\w\[\].]+)\}\}/g;

function extractVariablePaths(text: string): string[] {
  const paths: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = VARIABLE_REGEX.exec(text)) !== null) {
    paths.push(match[1]);
  }
  return paths;
}

function collectVariablesFromBlocks(blocks: TemplateBlock[]): Map<string, string[]> {
  const result = new Map<string, string[]>();

  for (const block of blocks) {
    const paths = extractVariablePaths(block.content);

    if (block.config.type === "conditional_block") {
      const cond = block.config.condition;
      for (const inner of cond.thenBlocks ?? []) {
        paths.push(...extractVariablePaths(inner.content));
      }
      for (const inner of cond.elseBlocks ?? []) {
        paths.push(...extractVariablePaths(inner.content));
      }
    }

    if (block.config.type === "variable_list") {
      paths.push(...extractVariablePaths(block.config.list.itemTemplate));
    }

    if (paths.length > 0) {
      result.set(block.id, paths);
    }
  }

  return result;
}

export function validateTemplateForPublishing(
  structure: TemplateStructure,
  kind: ContractDocumentKind,
): TemplateValidationIssue[] {
  const issues: TemplateValidationIssue[] = [];
  const blocks = structure.blocks;

  const hasLogoHeader = blocks.some((b) => b.type === "logo_header");
  if (!hasLogoHeader) {
    issues.push({ type: "error", message: "La plantilla debe incluir el bloque logo_header." });
  }

  const hasSignature = blocks.some((b) => b.type === "signature_block");
  if (!hasSignature) {
    issues.push({ type: "error", message: "La plantilla debe incluir el bloque de firmas." });
  }

  const hasBody = blocks.some((b) => b.type === "body_paragraph" && b.content.trim().length > 0);
  if (!hasBody) {
    issues.push({ type: "error", message: "La plantilla debe tener al menos un parrafo con contenido." });
  }

  for (const block of blocks) {
    if (block.type === "body_paragraph" && block.content.trim().length === 0) {
      issues.push({
        type: "warning",
        message: `Bloque de parrafo vacio encontrado.`,
        blockId: block.id,
      });
    }
  }

  const catalogPaths = new Set(
    getVariablesForKind(kind).map((v) => v.path),
  );

  const itemPrefixPaths = new Set(["item.fullName", "item.nationalId", "item.fiscalAddress.streetLine", "item.fiscalAddress.municipality"]);

  const usedVars = collectVariablesFromBlocks(blocks);
  for (const [blockId, paths] of usedVars) {
    for (const path of paths) {
      if (path.startsWith("_resolved_")) continue;
      if (path.startsWith("item.")) {
        if (!itemPrefixPaths.has(path)) {
          issues.push({
            type: "warning",
            message: `Variable de iteracion desconocida: {{${path}}}`,
            blockId,
          });
        }
        continue;
      }
      if (!catalogPaths.has(path)) {
        issues.push({
          type: "error",
          message: `Variable {{${path}}} no existe en el catalogo para el tipo ${kind}.`,
          blockId,
        });
      }
    }
  }

  return issues;
}
