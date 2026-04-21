import { z } from "zod";

const templateBlockTypeSchema = z.enum([
  "logo_header",
  "title",
  "heading",
  "body_paragraph",
  "shared_clause",
  "conditional_block",
  "variable_list",
  "signature_block",
  "additional_clauses_slot",
]);

const sharedClauseConfigSchema = z.object({
  clauseId: z.string().min(1),
  enabled: z.boolean(),
  overrideText: z.string().optional(),
});

const variableListConfigSchema = z.object({
  sourcePath: z.string().min(1),
  itemTemplate: z.string(),
  separator: z.string(),
});

const baseBlockSchema = z.object({
  id: z.string().min(1),
  type: templateBlockTypeSchema,
  content: z.string(),
});

const conditionalBlockConfigSchema: z.ZodType<{
  flagPath: string;
  operator: "eq" | "neq" | "truthy" | "falsy";
  value?: string;
  thenBlocks: z.infer<typeof templateBlockSchema>[];
  elseBlocks?: z.infer<typeof templateBlockSchema>[];
}> = z.object({
  flagPath: z.string().min(1),
  operator: z.enum(["eq", "neq", "truthy", "falsy"]),
  value: z.string().optional(),
  thenBlocks: z.lazy(() => z.array(templateBlockSchema)),
  elseBlocks: z.lazy(() => z.array(templateBlockSchema)).optional(),
});

const blockConfigSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("logo_header") }),
  z.object({ type: z.literal("title") }),
  z.object({ type: z.literal("heading") }),
  z.object({ type: z.literal("body_paragraph") }),
  z.object({ type: z.literal("shared_clause"), clause: sharedClauseConfigSchema }),
  z.object({ type: z.literal("conditional_block"), condition: conditionalBlockConfigSchema }),
  z.object({ type: z.literal("variable_list"), list: variableListConfigSchema }),
  z.object({ type: z.literal("signature_block"), labels: z.array(z.string()) }),
  z.object({ type: z.literal("additional_clauses_slot") }),
]);

export const templateBlockSchema = baseBlockSchema.extend({
  config: blockConfigSchema,
});

export const templateStructureSchema = z.object({
  blocks: z.array(templateBlockSchema),
});

export const variableBindingSchema = z.object({
  variablePath: z.string().min(1),
  sourceType: z.enum(["inmovilla", "neon", "derived", "input", "config"]),
  sourceDetail: z.string(),
  exampleValue: z.string(),
});

export const createTemplateBodySchema = z.object({
  documentKind: z.enum(["arras", "senal_compra", "oferta_firme", "anexo_mobiliario"]),
  name: z.string().min(1).max(200),
  version: z.string().min(1).max(50).optional(),
  cloneFromId: z.string().optional(),
});

export const updateTemplateBodySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  structure: templateStructureSchema.optional(),
  variableBindings: z.array(variableBindingSchema).optional(),
  sharedClauseOverrides: z.record(z.string().nullable()).optional(),
});
