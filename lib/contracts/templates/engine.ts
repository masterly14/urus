import { Document, type Paragraph } from "docx";
import type { ContractTemplateInput } from "@/types/contracts";
import type { TemplateBlock, TemplateStructure } from "@/types/contract-template";
import type { AdditionalClausesDoc } from "@/lib/contracts/additional-clauses/types";
import type { SectionAddendumsList } from "@/lib/contracts/section-addendums/types";
import { buildLogoHeaderParagraphs } from "@/lib/contracts/docx/blocks/logo-header";
import {
  additionalClausesNumberingConfig,
  buildAdditionalClausesParagraphs,
} from "@/lib/contracts/additional-clauses/docx-serializer";
import { buildSectionAddendumParagraphs } from "@/lib/contracts/section-addendums/docx-serializer";
import { getSectionCatalogForKind } from "@/lib/contracts/section-addendums/catalog";
import { buildLetterSectionProperties } from "@/lib/contracts/docx/document-defaults";
import { resolveVariablesInText, resolveVariableList } from "./variable-resolver";
import { evaluateCondition } from "./conditional-evaluator";
import { blockToDocxParagraphs } from "./block-to-docx";

export interface CompileTemplateOptions {
  additionalClausesDoc?: AdditionalClausesDoc | null;
  sharedClauseOverrides?: Record<string, string | null> | null;
  /**
   * Bloques añadidos por el comercial dentro de secciones concretas.
   * En el motor de plantillas dinámicas no existe aún un concepto de
   * "slot por sección"; mientras tanto, los addendums se inyectan en
   * bloque inmediatamente antes del slot de cláusulas adicionales,
   * preservando el orden insertado por el usuario.
   */
  sectionAddendums?: SectionAddendumsList | null;
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

  for (let idx = 0; idx < blocks.length; idx += 1) {
    const block = blocks[idx]!;
    if (block.type === "conditional_block" && block.config.type === "conditional_block") {
      const innerBlocks = evaluateCondition(block.config.condition, payload);
      resolved.push(...resolveBlocks(innerBlocks, payload));
      continue;
    }

    if (block.type === "variable_list" && block.config.type === "variable_list") {
      const { sourcePath, itemTemplate, separator } = block.config.list;
      const nextBlock = blocks[idx + 1];

      // Compatibilidad con plantillas seed iniciales:
      // si justo después hay un párrafo con {{_resolved_buyers}}/{{_resolved_sellers}},
      // omitimos la lista previa para evitar duplicar la sección de partes.
      const isDuplicatedResolvedParties =
        nextBlock?.type === "body_paragraph" &&
        ((sourcePath === "buyers" && nextBlock.content.includes("{{_resolved_buyers}}")) ||
          (sourcePath === "sellers" && nextBlock.content.includes("{{_resolved_sellers}}")));
      if (isDuplicatedResolvedParties) {
        continue;
      }

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

  const sectionAddendums = options.sectionAddendums ?? null;
  const sectionCatalog = getSectionCatalogForKind(input.kind);
  const sectionIdByHeading = new Map(
    sectionCatalog.map((s) => [s.label.trim().toLowerCase(), s.id])
  );
  
  const sectionsInjected = new Set<string>();
  let currentSectionId: string | null = null;

  for (const block of resolvedBlocks) {
    if (block.type === "logo_header") continue;

    if (block.type === "additional_clauses_slot") {
      // Inyectar el addendum de la sección actual si quedó pendiente
      if (currentSectionId && !sectionsInjected.has(currentSectionId)) {
        children.push(...buildSectionAddendumParagraphs(sectionAddendums, currentSectionId));
        sectionsInjected.add(currentSectionId);
      }
      
      const clauses = buildAdditionalClausesParagraphs(
        options.additionalClausesDoc ?? null,
      );
      children.push(...clauses);
      continue;
    }

    if (block.type === "heading") {
      // Antes de empezar la nueva sección, inyectamos los addendums de la anterior
      if (currentSectionId && !sectionsInjected.has(currentSectionId)) {
        children.push(...buildSectionAddendumParagraphs(sectionAddendums, currentSectionId));
        sectionsInjected.add(currentSectionId);
      }
      
      const headingText = block.content.trim().toLowerCase();
      currentSectionId = sectionIdByHeading.get(headingText) ?? null;
    }

    const paragraphs = blockToDocxParagraphs(
      block,
      options.sharedClauseOverrides,
      jurisdictionMunicipality,
      payload,
    );
    children.push(...paragraphs);
  }

  // Inyectar el addendum de la última sección si quedó pendiente
  if (currentSectionId && !sectionsInjected.has(currentSectionId)) {
    children.push(...buildSectionAddendumParagraphs(sectionAddendums, currentSectionId));
    sectionsInjected.add(currentSectionId);
  }
  
  // Inyectar cláusulas adicionales si no hubo slot
  if (!resolvedBlocks.some(b => b.type === "additional_clauses_slot")) {
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
    sections: [{ properties: buildLetterSectionProperties(), children }],
  });
}
