import { z } from "zod";
import type { AdditionalClausesDoc } from "./types";

/**
 * Zod para validar el JSON que llega del editor en la API.
 *
 * Todo lo que esté fuera del subset definido en `types.ts` es rechazado:
 * es intencional — evita que un cliente manipulado mande HTML arbitrario
 * o nodos que el serializer docx no sabría mapear, y protege el archivo
 * final que se envía a firma.
 */

const fontSizeSchema = z.enum(["S", "M", "L"]);

const textMarkSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("bold") }),
  z.object({ type: z.literal("italic") }),
  z.object({
    type: z.literal("fontSize"),
    attrs: z.object({ size: fontSizeSchema }),
  }),
]);

const textNodeSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  marks: z.array(textMarkSchema).optional(),
});

const paragraphSchema = z.object({
  type: z.literal("paragraph"),
  content: z.array(textNodeSchema).optional(),
});

const listItemSchema = z.object({
  type: z.literal("listItem"),
  content: z.array(paragraphSchema).optional(),
});

const bulletListSchema = z.object({
  type: z.literal("bulletList"),
  content: z.array(listItemSchema).optional(),
});

const orderedListSchema = z.object({
  type: z.literal("orderedList"),
  content: z.array(listItemSchema).optional(),
});

const blockSchema = z.discriminatedUnion("type", [
  paragraphSchema,
  bulletListSchema,
  orderedListSchema,
]);

export const additionalClausesDocSchema: z.ZodType<AdditionalClausesDoc> = z.object({
  type: z.literal("doc"),
  content: z.array(blockSchema).optional(),
});
