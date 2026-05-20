/**
 * Section addendums — extensiones de secciones específicas del contrato.
 *
 * Decisión de producto (ver análisis de UX, sección "Anotaciones por sección"):
 * - Las cláusulas adicionales (`additional-clauses`) van al final del contrato
 *   numeradas (`CLAUSULA N.- TITULO`). Sirven para añadir cláusulas nuevas.
 * - Los section addendums van DENTRO de una sección concreta (REUNIDOS,
 *   INMUEBLE, ESTIPULACIÓN PRIMERA, …) y sirven para ampliar/anexar detalles
 *   sin romper la numeración. P.ej. ampliar descripción del inmueble con
 *   datos registrales extra, anejos, cargas conocidas u observaciones.
 *
 * Diseño técnico:
 * - Cada addendum pertenece a una `sectionId` cerrada por `documentKind`
 *   (catálogo definido en `catalog.ts` — fuente de verdad UI + builders).
 * - Cada addendum tiene un `type` semántico (no texto libre arbitrario)
 *   para forzar profesionalismo y permitir clasificación por voz/LLM.
 * - El cuerpo (`contentDoc`) reutiliza el subset TipTap de las cláusulas
 *   adicionales: serializer, schema y editor son compartidos.
 */

import type { AdditionalClausesDoc } from "@/lib/contracts/additional-clauses/types";

/** Tipos semánticos del bloque añadido (controla la etiqueta legible). */
export const SECTION_ADDENDUM_TYPES = [
  "extended_description",
  "registry_extra",
  "encumbrances",
  "annexes",
  "notes",
] as const;
export type SectionAddendumType = (typeof SECTION_ADDENDUM_TYPES)[number];

/** Mapa tipo → etiqueta humana en el DOCX y la UI. */
export const SECTION_ADDENDUM_TYPE_LABEL: Record<SectionAddendumType, string> = {
  extended_description: "Descripción ampliada",
  registry_extra: "Datos registrales adicionales",
  encumbrances: "Cargas conocidas",
  annexes: "Anejos",
  notes: "Observaciones",
};

/** Un único bloque añadido a una sección. */
export interface SectionAddendum {
  /**
   * Identificador estable (cuid/ulid del cliente, no obligatorio en backend).
   * Se conserva para permitir editar/quitar un addendum concreto desde la UI
   * sin afectar al resto.
   */
  id: string;
  /** Sección destino. Cerrado por catálogo según `documentKind`. */
  sectionId: string;
  /** Tipo semántico del bloque. */
  type: SectionAddendumType;
  /** Contenido enriquecido (subset TipTap). */
  contentDoc: AdditionalClausesDoc;
  /** ISO timestamp de la última modificación. Útil para audit y diffs. */
  updatedAtIso?: string;
}

/**
 * Estructura persistida y enviada por la API. La elección de array (no map
 * por sectionId) permite preservar el orden de inserción del usuario, que
 * tiene significado para él, y simplifica la edición desde UI.
 */
export type SectionAddendumsList = SectionAddendum[];

/** True cuando no hay addendums con contenido real. */
export function isSectionAddendumsListEmpty(
  list: SectionAddendumsList | null | undefined,
): boolean {
  if (!list || list.length === 0) return true;
  return list.every((addendum) => isAddendumContentEmpty(addendum.contentDoc));
}

function isAddendumContentEmpty(doc: AdditionalClausesDoc): boolean {
  if (!doc.content || doc.content.length === 0) return true;
  return doc.content.every((block) => {
    if (block.type === "paragraph") {
      return (
        !block.content ||
        block.content.every((node) => node.type !== "text" || node.text.trim().length === 0)
      );
    }
    return (
      !block.content ||
      block.content.every((item) =>
        (item.content ?? []).every((p) => {
          if (p.type !== "paragraph") return true;
          return (
            !p.content ||
            p.content.every((n) => n.type !== "text" || n.text.trim().length === 0)
          );
        }),
      )
    );
  });
}

/** Devuelve los addendums no vacíos cuyo sectionId coincide. */
export function filterAddendumsBySection(
  list: SectionAddendumsList | null | undefined,
  sectionId: string,
): SectionAddendum[] {
  if (!list || list.length === 0) return [];
  return list.filter(
    (addendum) =>
      addendum.sectionId === sectionId && !isAddendumContentEmpty(addendum.contentDoc),
  );
}
