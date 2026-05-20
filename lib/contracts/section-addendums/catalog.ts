/**
 * Catálogo cerrado de secciones por tipo de contrato.
 *
 * Es la fuente de verdad compartida entre:
 * - Builders DOCX (donde se inyectan los addendums en el slot correcto).
 * - UI del editor (lista de secciones seleccionables en el diálogo).
 * - Validación Zod (sectionId debe pertenecer al catálogo del kind).
 *
 * No es genérico a propósito: cada contrato tiene su anatomía. Añadir una
 * sección nueva implica:
 *  1) Añadirla aquí.
 *  2) Insertar el slot correspondiente en el builder.
 *  3) (Opcional) Documentar la nueva sección en `docs/`.
 */

import type { ContractTemplateInput } from "@/types/contracts";

export interface SectionCatalogEntry {
  /** Identificador estable usado en persistencia y serializer. */
  id: string;
  /** Etiqueta humana para la UI (Card/listado). */
  label: string;
  /** Texto corto que ayuda al comercial a entender qué encaja aquí. */
  hint?: string;
  /**
   * Texto LITERAL del heading tal y como aparece en el DOCX/HTML
   * generado. Imprescindible para que el preview HTML de mammoth
   * pueda localizar el bloque y permitir edición inline estilo Notion.
   * Si se omite, esa sección sólo se podrá editar desde el panel inferior.
   */
  docxHeading?: string;
}

/**
 * IMPORTANTE: los ids deben coincidir 1:1 con los slots invocados desde los
 * builders (arras.ts, senal-compra.ts, oferta-firme.ts). No renombrar sin
 * actualizar ambos lugares.
 */
const ARRAS_SECTIONS: readonly SectionCatalogEntry[] = [
  {
    id: "parties",
    label: "Reunidos",
    hint: "Datos extra de comprador/vendedor (representaciones, poderes, regímenes).",
    docxHeading: "REUNIDOS",
  },
  {
    id: "property",
    label: "Inmueble",
    hint: "Descripción ampliada, anejos, plazas de garaje, trasteros, mobiliario incluido.",
    docxHeading: "INMUEBLE",
  },
  {
    id: "stipulation_first",
    label: "Primera — Precio y arras",
    hint: "Detalles del pago, divisiones, condiciones particulares de la transferencia.",
    docxHeading: "PRIMERA.- PRECIO Y ARRAS",
  },
  {
    id: "stipulation_second",
    label: "Segunda — Plazo para escritura",
    hint: "Condiciones suspensivas, hitos previos a notaría, plazos especiales.",
    docxHeading: "SEGUNDA.- PLAZO PARA ESCRITURA",
  },
  {
    id: "stipulation_third",
    label: "Tercera — Entrega de llaves",
    hint: "Inventario, lectura de contadores, condiciones del estado de entrega.",
    docxHeading: "TERCERA.- ENTREGA DE LLAVES",
  },
  {
    id: "stipulation_fourth",
    label: "Cuarta — Gastos e impuestos",
    hint: "Reparto de gastos no estándar, plusvalía pactada, gastos de comunidad.",
    docxHeading: "CUARTA.- GASTOS E IMPUESTOS",
  },
  {
    id: "stipulation_fifth",
    label: "Quinta — Cargas",
    hint: "Cargas conocidas a cancelar, hipotecas a subrogar, embargos pendientes.",
    docxHeading: "QUINTA.- CARGAS",
  },
  {
    id: "stipulation_sixth",
    label: "Sexta — Estado del inmueble",
    hint: "Vicios conocidos, reparaciones pendientes, informes técnicos.",
    docxHeading: "SEXTA.- ESTADO DEL INMUEBLE",
  },
  {
    id: "stipulation_seventh",
    label: "Séptima — Fuero",
    hint: "Pactos de mediación previa, condiciones procesales adicionales.",
    docxHeading: "SEPTIMA.- FUERO",
  },
];

const SENAL_COMPRA_SECTIONS: readonly SectionCatalogEntry[] = [
  {
    id: "manifiesta_primero",
    label: "Primero — Recepción y inmueble",
    hint: "Datos ampliados del inmueble ofertado, anejos, mobiliario, plazas.",
    docxHeading: "Primero.",
  },
  {
    id: "manifiesta_segundo",
    label: "Segundo — Desistimiento",
    hint: "Condiciones particulares del desistimiento, excepciones acordadas.",
    docxHeading: "Segundo.",
  },
  {
    id: "manifiesta_tercero",
    label: "Tercero — Devolución",
    hint: "Plazos, vía y condiciones particulares de devolución de la señal.",
    docxHeading: "Tercero.",
  },
  {
    id: "manifiesta_cuarto",
    label: "Cuarto — Plazos",
    hint: "Hitos intermedios, condiciones de prórroga, comunicaciones específicas.",
    docxHeading: "Cuarto.",
  },
  {
    id: "manifiesta_financing",
    label: "Cláusula de financiación",
    hint: "Detalles de la condición suspensiva por financiación (cuando aplica).",
  },
  {
    id: "manifiesta_gastos",
    label: "Gastos e impuestos",
    hint: "Reparto de gastos no estándar.",
  },
  {
    id: "manifiesta_cargas",
    label: "Cargas",
    hint: "Cargas conocidas, hipotecas a cancelar/subrogar.",
  },
  {
    id: "manifiesta_honorarios",
    label: "Honorarios",
    hint: "Condiciones particulares de devengo o facturación.",
  },
  {
    id: "manifiesta_fuero",
    label: "Fuero",
    hint: "Pactos procesales adicionales.",
  },
];

const OFERTA_FIRME_SECTIONS: readonly SectionCatalogEntry[] = [
  {
    id: "manifiesta_primero",
    label: "Primero — Recepción y precio",
    hint: "Datos ampliados del inmueble ofertado y condiciones del depósito.",
    docxHeading: "Primero.",
  },
  {
    id: "manifiesta_segundo",
    label: "Segundo — Arras tras aceptación",
    hint: "Condiciones particulares de las arras posteriores a la aceptación.",
    docxHeading: "Segundo.",
  },
  {
    id: "manifiesta_tercero",
    label: "Tercero — Devolución",
    hint: "Condiciones particulares de devolución del depósito.",
    docxHeading: "Tercero.",
  },
  {
    id: "manifiesta_cuarto",
    label: "Cuarto — Gastos e impuestos",
    hint: "Reparto de gastos no estándar.",
    docxHeading: "Cuarto.",
  },
  {
    id: "manifiesta_quinto",
    label: "Quinto — Cargas",
    hint: "Cargas conocidas a cancelar o subrogar.",
    docxHeading: "Quinto.",
  },
  {
    id: "manifiesta_sexto",
    label: "Sexto — Honorarios",
    hint: "Condiciones particulares de devengo o facturación.",
    docxHeading: "Sexto.",
  },
  {
    id: "manifiesta_septimo",
    label: "Séptimo — Fuero",
    hint: "Pactos procesales adicionales.",
    docxHeading: "Septimo.",
  },
];

const CATALOG: Record<string, readonly SectionCatalogEntry[]> = {
  arras: ARRAS_SECTIONS,
  senal_compra: SENAL_COMPRA_SECTIONS,
  oferta_firme: OFERTA_FIRME_SECTIONS,
};

export function getSectionCatalogForKind(
  kind: ContractTemplateInput["kind"] | string,
): readonly SectionCatalogEntry[] {
  return CATALOG[kind] ?? [];
}

export function isValidSectionIdForKind(
  kind: ContractTemplateInput["kind"] | string,
  sectionId: string,
): boolean {
  const catalog = CATALOG[kind] ?? [];
  return catalog.some((entry) => entry.id === sectionId);
}

export function getSectionLabel(
  kind: ContractTemplateInput["kind"] | string,
  sectionId: string,
): string {
  const catalog = CATALOG[kind] ?? [];
  return catalog.find((entry) => entry.id === sectionId)?.label ?? sectionId;
}
