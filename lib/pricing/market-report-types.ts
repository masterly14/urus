/**
 * M7 — Informe Estratégico IA de Mercado.
 *
 * Schema Zod para structured output de LangGraph + interfaces TypeScript.
 * El grafo recibe el snapshot de mercado (zonas + competidores) y produce
 * un informe estratégico dirigido a dirección de Urus Capital Group.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod — structured output para LangGraph
// ---------------------------------------------------------------------------

const ZonaDestacadaSchema = z.object({
  zona: z.string().describe("Nombre de la zona."),
  precioMedioM2: z.number().describe("€/m² medio de la zona."),
  interpretacion: z
    .string()
    .describe(
      "Interpretación estratégica de la zona en 1–3 frases: " +
        "si está cara, barata, con alta rotación, estancada, etc. " +
        "Citar datos concretos del snapshot.",
    ),
  oportunidad: z
    .string()
    .nullable()
    .describe(
      "Oportunidad identificada para URUS en esta zona (null si no hay).",
    ),
});

export const MarketReportSchema = z.object({
  resumenEjecutivo: z
    .string()
    .describe(
      "Resumen ejecutivo de 3–5 frases para dirección. " +
        "Visión general del mercado en la ciudad analizada, tendencia, " +
        "posición de la cartera URUS y conclusión principal.",
    ),
  panoramaMercado: z.object({
    ofertaTotal: z
      .number()
      .describe("Nº total de inmuebles rastreados en las zonas analizadas."),
    rangoM2: z
      .string()
      .describe("Rango del €/m² medio observado (ej. '1.800 – 3.100 €/m²')."),
    demandaGlobal: z
      .enum(["alta", "media", "baja"])
      .describe(
        "Clasificación global de la demanda en la ciudad basada en la " +
          "distribución de demanda alta/media/baja de las zonas.",
      ),
    descripcion: z
      .string()
      .describe(
        "Párrafo de 2–4 frases describiendo el panorama general del mercado " +
          "con datos concretos: nº de zonas, dispersión de precios, " +
          "distribución de demanda.",
      ),
  }),
  zonasDestacadas: z
    .array(ZonaDestacadaSchema)
    .min(1)
    .max(7)
    .describe("Top zonas con interpretación estratégica (máx 7)."),
  posicionamientoUrus: z.object({
    totalPropiedades: z
      .number()
      .describe("Total de propiedades URUS con informe de pricing."),
    semaforos: z.object({
      verde: z.number(),
      amarillo: z.number(),
      rojo: z.number(),
    }),
    gapMedio: z
      .number()
      .describe("Diferencia media ponderada de la cartera URUS vs mercado (%)."),
    concentracionGeografica: z
      .string()
      .describe(
        "Descripción en 1–2 frases de la concentración geográfica: " +
          "en cuántas zonas se reparte la cartera, si está diversificada o concentrada.",
      ),
    diagnostico: z
      .string()
      .describe(
        "Diagnóstico de la posición de URUS en 2–4 frases con datos concretos. " +
          "¿Está alineada con el mercado? ¿Hay riesgo por desajuste de precios excesivo?",
      ),
  }),
  oportunidades: z
    .array(z.string())
    .min(2)
    .max(5)
    .describe(
      "2–5 oportunidades estratégicas para URUS Capital Group derivadas " +
        "del análisis. Accionables, específicas y citando zonas/datos.",
    ),
  riesgos: z
    .array(z.string())
    .min(2)
    .max(5)
    .describe(
      "2–5 riesgos estratégicos identificados. Concretos y con impacto cuantificable.",
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confianza global del informe (0–1)."),
  reasoning: z
    .string()
    .describe("Razonamiento interno breve para auditoría y trazabilidad."),
});

// ---------------------------------------------------------------------------
// Tipos TypeScript derivados
// ---------------------------------------------------------------------------

export type MarketReport = z.infer<typeof MarketReportSchema>;
export type MarketReportZonaDestacada = z.infer<typeof ZonaDestacadaSchema>;

// ---------------------------------------------------------------------------
// Input snapshot type (what we send to the LLM and persist in BD)
// ---------------------------------------------------------------------------

export interface MarketReportInputSnapshot {
  ciudad: string;
  zones: Array<{
    zona: string;
    precioMedioM2: number;
    precioMedio: number;
    propiedades: number;
    propiedadesUrus: number;
    tendenciaPorcentaje: number;
    demanda: string;
  }>;
  competitors: Array<{
    propertyCode: string;
    titulo: string;
    precio: number;
    precioM2: number;
    metros: number;
    zona: string;
    semaforo: string;
    gapPorcentaje: number;
    diasPublicado: number | null;
    totalComparables: number;
  }>;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// API response shape
// ---------------------------------------------------------------------------

export interface MarketReportRecord {
  id: string;
  ciudad: string;
  generatedBy: string;
  model: string;
  report: MarketReport;
  inputSnapshot: MarketReportInputSnapshot;
  tokensUsed: number | null;
  generatedAt: string;
}
