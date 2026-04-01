/**
 * Payload del evento CONTRATO_VERSIONADO (Neon / event store).
 */

import { z } from "zod";

export const contratoVersionadoCloudinarySchema = z.object({
  publicId: z.string().min(1),
  secureUrl: z.string().min(1),
  bytes: z.number().int().nonnegative(),
});

export type ContratoVersionadoCloudinary = z.infer<
  typeof contratoVersionadoCloudinarySchema
>;

export const contratoVersionadoPayloadSchema = z.object({
  operationId: z.string().min(1),
  propertyCode: z.string().min(1),
  documentKind: z.enum([
    "arras",
    "senal_compra",
    "oferta_firme",
    "anexo_mobiliario",
  ]),
  previousTemplateVersion: z.string().nullable().optional(),
  nextTemplateVersion: z.string().min(1),
  docxFileName: z.string().min(1),
  appliedSummaries: z.array(z.string()),
  /** Parche estructurado devuelto por el intérprete (JSON-serializable). */
  patch: z.unknown(),
  transcript: z.string().optional(),
  transcriptSha256: z.string().optional(),
  actorUserId: z.string().optional(),
  docxSha256: z.string().optional(),
  cloudinary: contratoVersionadoCloudinarySchema.optional(),
});

export type ContratoVersionadoPayload = z.infer<
  typeof contratoVersionadoPayloadSchema
>;

export function parseContratoVersionadoPayload(
  data: unknown,
): ContratoVersionadoPayload {
  return contratoVersionadoPayloadSchema.parse(data);
}
