/**
 * M7 — Grafo LangGraph: datos agregados de mercado → informe estratégico IA.
 *
 * Recibe un MarketReportInputSnapshot (zonas + competidores) y produce un
 * MarketReport estructurado dirigido a dirección de Urus Capital Group.
 *
 * Mismo patrón que pricing-recommendation-graph.ts:
 *   StateGraph → nodo único → withStructuredOutput(Zod) → withRetry.
 */

import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { llm } from "./llm";
import { withRetry } from "./utils/retry";
import {
  MarketReportSchema,
  type MarketReport,
  type MarketReportInputSnapshot,
} from "@/lib/pricing/market-report-types";

// ── LLM con output estructurado ───────────────────────────────────────────────

const llmStructured = llm.withStructuredOutput(MarketReportSchema, {
  name: "generar_informe_mercado",
});

// ── Estado del grafo ─────────────────────────────────────────────────────────

const MarketReportState = Annotation.Root({
  input: Annotation<MarketReportInputSnapshot>,
  report: Annotation<MarketReport | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  error: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
});

type MarketReportStateType = typeof MarketReportState.State;

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres un analista senior de mercado inmobiliario trabajando para Urus Capital Group, una consultora inmobiliaria de Córdoba, España.

Tu tarea es analizar los datos agregados de mercado (zonas + propiedades de la cartera URUS) y producir un INFORME ESTRATÉGICO dirigido a la dirección de la empresa.

CONTEXTO:
- Precios en EUR, superficies en m².
- "URUS" se refiere a la cartera gestionada por Urus Capital Group.
- Las zonas representan barrios/áreas de la ciudad con métricas agregadas.
- Cada propiedad de la cartera URUS tiene un semáforo:
  · VERDE: |gap| ≤ 5% — bien posicionada frente al mercado.
  · AMARILLO: 5% < |gap| ≤ 12% — riesgo moderado, necesita atención.
  · ROJO: |gap| > 12% — fuera de mercado, requiere acción urgente.
- El "gap" es la diferencia porcentual entre el €/m² del inmueble URUS y la mediana de comparables de mercado.
  · Gap positivo = URUS más caro que mercado.
  · Gap negativo = URUS más barato que mercado.
- "Tendencia" refleja la dirección del gap medio por zona: positivo = la cartera URUS tiene margen al alza, negativo = está por encima del mercado.
- "Demanda" se clasifica heurísticamente según volumen de actividad y gap medio de la zona (alta: ≥15 inmuebles & gap ≤ 0%; media: ≥8 inmuebles ó gap ≤ 3%; baja: el resto).

INSTRUCCIONES:
- Dirígete a la dirección de URUS Capital Group, no al usuario final ni al comercial.
- Usa SIEMPRE datos concretos: cifras, porcentajes, nombres de zonas, número de propiedades.
- El resumen ejecutivo es lo primero que leerá el CEO: debe ser conciso y conclusivo.
- En panoramaMercado.descripcion contextualiza la ciudad: precio medio, dispersión, actividad.
- En zonasDestacadas selecciona las más relevantes: con más propiedades URUS, con gaps extremos, con oportunidades claras.
- En posicionamientoUrus sé honesto: si la cartera está mal posicionada, dilo claramente con datos.
- Las oportunidades y riesgos deben ser ESTRATÉGICOS (ej. "Reducir exposición en zona X" o "Captar inmuebles en zona Y donde URUS no tiene presencia"), no operativos.
- Escribe en español profesional, directo, sin florituras.

FORMATO:
- Todos los campos de texto en español.
- Tono: informe ejecutivo, profesional, orientado a decisiones.`;

// ── Serialización del snapshot ────────────────────────────────────────────────

function serializeSnapshotForPrompt(snapshot: MarketReportInputSnapshot): string {
  const zoneLines = snapshot.zones.map((z, i) => {
    const trend = z.tendenciaPorcentaje >= 0
      ? `+${z.tendenciaPorcentaje}%`
      : `${z.tendenciaPorcentaje}%`;
    return `  ${i + 1}. ${z.zona}: ${z.precioMedioM2} €/m² | ${z.propiedades} inmuebles (${z.propiedadesUrus} URUS) | tendencia ${trend} | demanda ${z.demanda}`;
  });

  const compLines = snapshot.competitors.map((c, i) => {
    const gap = c.gapPorcentaje >= 0 ? `+${c.gapPorcentaje.toFixed(1)}%` : `${c.gapPorcentaje.toFixed(1)}%`;
    return `  ${i + 1}. [${c.semaforo.toUpperCase()}] ${c.titulo} | ${c.zona} | ${c.precio.toLocaleString("es-ES")} € (${c.precioM2} €/m²) | ${c.metros} m² | gap ${gap} | ${c.diasPublicado !== null ? `${c.diasPublicado}d publicado` : "sin dato de días"} | ${c.totalComparables} comparables`;
  });

  const totalUrus = snapshot.zones.reduce((s, z) => s + z.propiedadesUrus, 0);
  const totalMercado = snapshot.zones.reduce((s, z) => s + z.propiedades, 0);

  return `CIUDAD: ${snapshot.ciudad}
FECHA: ${snapshot.generatedAt}
ZONAS ANALIZADAS: ${snapshot.zones.length}
TOTAL INMUEBLES MERCADO: ${totalMercado}
TOTAL INMUEBLES URUS: ${totalUrus}
PROPIEDADES URUS CON INFORME: ${snapshot.competitors.length}

═══ ZONAS ═══
${zoneLines.join("\n")}

═══ CARTERA URUS (propiedades con informe de pricing) ═══
${compLines.length > 0 ? compLines.join("\n") : "  Sin propiedades con informe de pricing aún."}`;
}

// ── Nodo del grafo ────────────────────────────────────────────────────────────

async function analyzeNode(
  state: MarketReportStateType,
): Promise<Partial<MarketReportStateType>> {
  const snapshot = state.input;

  if (snapshot.zones.length === 0) {
    return {
      error: "No hay zonas de mercado disponibles para generar el informe.",
    };
  }

  try {
    const userContent = serializeSnapshotForPrompt(snapshot);

    const raw = await withRetry(
      () =>
        llmStructured.invoke([
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Genera el informe estratégico de mercado para la dirección de URUS Capital Group:\n\n${userContent}`,
          },
        ]),
      { maxAttempts: 3, baseDelayMs: 2_000 },
    );

    const report: MarketReport = {
      resumenEjecutivo: raw.resumenEjecutivo,
      panoramaMercado: raw.panoramaMercado,
      zonasDestacadas: raw.zonasDestacadas,
      posicionamientoUrus: raw.posicionamientoUrus,
      oportunidades: raw.oportunidades,
      riesgos: raw.riesgos,
      confidence: raw.confidence,
      reasoning: raw.reasoning,
    };

    return { report };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `Error generando informe de mercado: ${msg}` };
  }
}

// ── Grafo compilado ───────────────────────────────────────────────────────────

export const marketReportGraph = new StateGraph(MarketReportState)
  .addNode("analizar", analyzeNode)
  .addEdge(START, "analizar")
  .addEdge("analizar", END)
  .compile();

// ── Función de entrada pública ────────────────────────────────────────────────

export async function generateMarketReport(
  snapshot: MarketReportInputSnapshot,
): Promise<MarketReport> {
  const result = await marketReportGraph.invoke({ input: snapshot });

  if (result.error) {
    throw new Error(result.error);
  }

  if (!result.report) {
    throw new Error("El agente de mercado no produjo informe.");
  }

  return result.report;
}
