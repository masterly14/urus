/**
 * Cláusulas adicionales — subset controlado de TipTap JSON.
 *
 * Decisión (ver AGENTS.md, análisis de completitud del módulo de contratos):
 * - El agente escribe cláusulas libres por operación en un editor WYSIWYG.
 * - Para persistirlo y renderizarlo en el docx final de forma determinista,
 *   fijamos un subset acotado del esquema TipTap: nada de HTML arbitrario,
 *   nada de imágenes/tablas/links.
 * - Este archivo es la fuente de verdad del esquema: lo usa Zod en la API,
 *   el serializer docx y la configuración del editor TipTap en el cliente.
 */

export type AdditionalClauseFontSize = "S" | "M" | "L";

export interface AdditionalClauseTextMark {
  type: "bold" | "italic" | "fontSize";
  attrs?: { size?: AdditionalClauseFontSize };
}

export interface AdditionalClauseTextNode {
  type: "text";
  text: string;
  marks?: AdditionalClauseTextMark[];
}

export interface AdditionalClauseParagraph {
  type: "paragraph";
  content?: AdditionalClauseTextNode[];
}

export interface AdditionalClauseListItem {
  type: "listItem";
  content?: AdditionalClauseParagraph[];
}

export interface AdditionalClauseBulletList {
  type: "bulletList";
  content?: AdditionalClauseListItem[];
}

export interface AdditionalClauseOrderedList {
  type: "orderedList";
  content?: AdditionalClauseListItem[];
}

export type AdditionalClauseBlock =
  | AdditionalClauseParagraph
  | AdditionalClauseBulletList
  | AdditionalClauseOrderedList;

export interface AdditionalClausesDoc {
  type: "doc";
  content?: AdditionalClauseBlock[];
}

/** Título de la sección en el docx final. */
/** Mapa S/M/L → half-points docx, coherente con los builders existentes. */
export const ADDITIONAL_CLAUSES_FONT_SIZE_HALFPOINTS: Record<
  AdditionalClauseFontSize,
  number
> = {
  S: 20,
  M: 24,
  L: 32,
};

/**
 * Documento vacío según TipTap (StarterKit requiere al menos un párrafo raíz
 * al arrancar el editor). Un `content: []` también es válido pero algunos
 * builds de TipTap prefieren explícitamente un párrafo vacío.
 */
export const EMPTY_ADDITIONAL_CLAUSES_DOC: AdditionalClausesDoc = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

/**
 * True cuando el documento no aporta ningún texto útil al PDF final
 * (sin nodos o con párrafos vacíos). En ese caso los builders docx
 * omiten por completo la sección de cláusulas añadidas por el comercial.
 */
export function isAdditionalClausesDocEmpty(
  doc: AdditionalClausesDoc | null | undefined,
): boolean {
  if (!doc || !Array.isArray(doc.content) || doc.content.length === 0) {
    return true;
  }
  return doc.content.every((block) => isBlockEmpty(block));
}

function isBlockEmpty(block: AdditionalClauseBlock): boolean {
  if (block.type === "paragraph") {
    return (
      !block.content ||
      block.content.every(
        (node) => node.type !== "text" || node.text.trim().length === 0,
      )
    );
  }
  return (
    !block.content ||
    block.content.every((item) =>
      (item.content ?? []).every((p) => isBlockEmpty(p)),
    )
  );
}
