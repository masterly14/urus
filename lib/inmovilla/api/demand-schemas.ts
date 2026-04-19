import { z } from "zod";

/**
 * Validación zod para las respuestas del endpoint de paginación de demandas.
 * Permite degradación parcial: campos opcionales se relajan, campos críticos
 * (codigo, fields) son requeridos.
 */

export const demandFieldSchema = z.object({
  campo: z.string(),
  value: z.unknown(),
});

export const demandRawSchema = z.object({
  acciones: z.array(z.unknown()).default([]),
  fields: z.array(demandFieldSchema).min(1),
});

const paginationInfoSchema = z.object({
  vista: z.string().optional().default(""),
  ficha: z.string().optional().default(""),
  data: z.string().optional().default(""),
  tipopag: z.string().optional().default(""),
  posicion: z.number().optional().default(0),
  paginacion: z.union([z.number(), z.string()]).default(10),
  pagactual: z.number().optional().default(0),
  campos: z.record(z.string(), z.unknown()).optional().default({}),
});

/** Inmovilla devuelve `datos` como array en algunas respuestas y como objeto `{ "10": row, ... }` en otras. */
function demResultadosDatosToArray(
  d: unknown[] | Record<string, unknown> | undefined,
): unknown[] {
  if (d === undefined) return [];
  if (Array.isArray(d)) return d;
  return Object.keys(d)
    .sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return a.localeCompare(b);
    })
    .map((k) => d[k]);
}

const demandDatosInputSchema = z
  .union([z.array(z.unknown()), z.record(z.string(), z.unknown())])
  .optional();

const demandResultadosSchema = z.object({
  info: paginationInfoSchema,
  datos: demandDatosInputSchema.transform(demResultadosDatosToArray),
});

export const demandPaginationResponseSchema = z.object({
  demandas: z.object({
    demresultados: demandResultadosSchema,
  }),
});

export type ValidatedDemandRaw = z.infer<typeof demandRawSchema>;

/**
 * Valida un registro crudo de demanda. Retorna el objeto validado o null si
 * el registro no tiene la estructura mínima requerida.
 */
export function validateDemandRecord(raw: unknown): ValidatedDemandRaw | null {
  const result = demandRawSchema.safeParse(raw);
  if (result.success) return result.data;
  return null;
}

/**
 * Valida la respuesta de paginación completa. Lanza si la estructura
 * raíz (demandas.demresultados) falta; los registros individuales se
 * validan por separado con degradación parcial.
 */
export function validatePaginationResponse(data: unknown): {
  info: z.infer<typeof paginationInfoSchema>;
  rawRecords: unknown[];
} {
  const parsed = demandPaginationResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Respuesta de paginación de demandas inválida: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
  }
  return {
    info: parsed.data.demandas.demresultados.info,
    rawRecords: parsed.data.demandas.demresultados.datos,
  };
}
