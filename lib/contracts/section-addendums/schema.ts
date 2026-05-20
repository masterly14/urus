import { z } from "zod";
import { additionalClausesDocSchema } from "@/lib/contracts/additional-clauses/schema";
import {
  SECTION_ADDENDUM_TYPES,
  type SectionAddendum,
  type SectionAddendumsList,
} from "./types";

/**
 * Validación Zod para los addendums recibidos por la API.
 *
 * Notas de seguridad:
 * - `sectionId` se valida en API contra el catálogo del `documentKind`
 *   correspondiente (ver `isValidSectionIdForKind`). Aquí solo aseguramos
 *   que sea string no vacío.
 * - `contentDoc` reutiliza el subset TipTap ya endurecido para cláusulas
 *   adicionales (paragraph, bold, italic, fontSize S/M/L, listas).
 * - `id` se acepta como string libre (los clientes generan cuid/ulid).
 */

const sectionAddendumSchema: z.ZodType<SectionAddendum> = z.object({
  id: z.string().min(1, "id requerido"),
  sectionId: z.string().min(1, "sectionId requerido"),
  type: z.enum(SECTION_ADDENDUM_TYPES),
  contentDoc: additionalClausesDocSchema,
  updatedAtIso: z.string().datetime().optional(),
});

export const sectionAddendumsListSchema: z.ZodType<SectionAddendumsList> = z.array(
  sectionAddendumSchema,
);
