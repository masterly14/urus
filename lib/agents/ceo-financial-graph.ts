/**
 * M13 — Grafo LangGraph: datos financieros + automatizaciones → análisis de
 * costes, ROI de automatizaciones y recomendaciones de reinversión.
 *
 * Recibe CeoFinancialInput y produce CeoFinancialRecommendation con
 * structured output validado por Zod.
 */

import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { llm } from "./llm";
import { withRetry } from "./utils/retry";
import {
  CeoFinancialSchema,
  type CeoFinancialRecommendation,
} from "@/lib/dashboard/ceo/financial-types";
import type { CeoOverviewPayload, CeoCityPerformancePayload } from "@/lib/dashboard/ceo/types";

// ── Constantes de automatizaciones asumidas ─────────────────────────────────

export interface AutomationAssumption {
  nombre: string;
  coste_mensual_eur: number;
  ahorro_horas: number;
  coste_hora_eur: number;
}

export const AUTOMATIZACIONES_ASUMIDAS: AutomationAssumption[] = [
  { nombre: "Cadencia automática postventa", coste_mensual_eur: 50, ahorro_horas: 20, coste_hora_eur: 25 },
  { nombre: "Sistema alertas comerciales", coste_mensual_eur: 30, ahorro_horas: 10, coste_hora_eur: 25 },
  { nombre: "Firma digital in-house", coste_mensual_eur: 15, ahorro_horas: 8, coste_hora_eur: 40 },
  { nombre: "Scoring automático de leads", coste_mensual_eur: 40, ahorro_horas: 15, coste_hora_eur: 25 },
];

// ── Tipos de input ──────────────────────────────────────────────────────────

export interface CeoFinancialInput {
  overview: CeoOverviewPayload;
  cities: CeoCityPerformancePayload;
  automatizaciones: AutomationAssumption[];
}

// ── LLM con output estructurado ────────────────────────────────────────────

const llmStructured = llm.withStructuredOutput(CeoFinancialSchema, {
  name: "analizar_finanzas",
});

// ── Estado del grafo ────────────────────────────────────────────────────────

const CeoFinancialState = Annotation.Root({
  input: Annotation<CeoFinancialInput>,
  recommendation: Annotation<CeoFinancialRecommendation | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  error: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
});

type CeoFinStateType = typeof CeoFinancialState.State;

// ── System prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres un controller financiero experto en empresas inmobiliarias en España. Trabajas para Urus Capital Group, que opera en Córdoba, Málaga y Sevilla.

Tu tarea es analizar la estructura de costes, evaluar el ROI de las automatizaciones implementadas y recomendar las mejores opciones de reinversión del excedente.

ANÁLISIS DE COSTES:

1. COSTES FIJOS: usa fixedCostsEur del snapshot. Si no hay dato, estima como 60-70% del coste operativo total (nóminas, alquiler, suscripciones tech).
2. COSTES VARIABLES: usa variableCostsEur. Si no hay dato, estima como costeOperativo - costesFijos.
3. COSTE POR OPERACIÓN: costeOperativo / operacionesCerradas del mes.
4. RATIO FIJO/VARIABLE: costesFijos / (costesFijos + costesVariables). Un ratio > 0.75 indica poca flexibilidad.

ROI DE AUTOMATIZACIONES:

Para cada automatización recibida, calcula:
- ahorro_mensual_eur = ahorro_horas × coste_hora_eur
- roi_percent = (ahorro_mensual_eur - coste_mensual_eur) / coste_mensual_eur × 100
- roi_automatizaciones_total = promedio ponderado por ahorro de todos los ROIs individuales

SEMÁFORO FINANCIERO:

- Verde: ratio coste/revenue < 60%
- Amarillo: ratio coste/revenue >= 60% y < 80%
- Rojo: ratio coste/revenue >= 80%

RECOMENDACIONES DE REINVERSIÓN:

La capacidad de reinversión se toma del campo reinvestmentCapacity (o se calcula como cash - 3 meses de costes fijos). Distribuye ese presupuesto en 2-5 recomendaciones priorizadas considerando:

- El estado actual de la empresa (semáforos, alertas, rendimiento por ciudad)
- Áreas con mayor ROI potencial
- Horizonte temporal realista (1-24 meses)
- No recomendar más de lo que la capacidad de reinversión permite

Categorías válidas: tecnologia, talento, marketing, formacion, infraestructura, expansion.

INSTRUCCIONES:

- Citar cifras concretas del input, no inventar datos.
- Si faltan datos de costes fijos/variables, estimarlos y explicar en reasoning.
- El resumen ejecutivo es para el CEO: máximo 2 frases directas.
- Todo en español, tono profesional.
- Ser conservador en las recomendaciones de reinversión.`;

// ── Serialización del input para el prompt ──────────────────────────────────

function serializeInputForPrompt(input: CeoFinancialInput): string {
  const { overview, cities, automatizaciones } = input;
  const k = overview.kpis;

  const kpiBlock = `KPIS FINANCIEROS:
- Facturación mensual: ${k.facturacionMensual.value.toLocaleString("es-ES")} € (var: ${k.facturacionMensual.changePercent ?? "—"}%)
- Facturación trimestral: ${k.facturacionTrimestral.value.toLocaleString("es-ES")} €
- EBITDA: ${k.ebitda.value.toLocaleString("es-ES")} € (var: ${k.ebitda.changePercent ?? "—"}%)
- Coste operativo: ${k.costeOperativo.value.toLocaleString("es-ES")} €
- Margen por operación: ${k.margenPorOperacion.value.toFixed(1)}%
- Cash disponible: ${k.cashDisponible.value.toLocaleString("es-ES")} €
- Capacidad reinversión: ${k.capacidadReinversion.value.toLocaleString("es-ES")} €`;

  const semaforosBlock = `SEMÁFOROS ACTUALES:
- Facturación: ${overview.semaforos.facturacion}
- Equipo: ${overview.semaforos.equipo}
- Expansión: ${overview.semaforos.expansion}
- Costes: ${overview.semaforos.costes}`;

  const operBlock = `OPERACIONES:
- Activas: ${overview.operaciones.activas}
- Cerradas este mes: ${overview.operaciones.cerradasMes}`;

  const equipoBlock = `EQUIPO:
- Comerciales activos: ${overview.equipo.comercialesActivos}
- Alertas abiertas: ${overview.equipo.alertasAbiertas}
- Carga media: ${overview.equipo.cargaMedia}%`;

  let historicoBlock = "HISTÓRICO 6 MESES: sin datos disponibles.";
  if (overview.historico.length > 0) {
    const lines = overview.historico.map(
      (h) =>
        `  - ${h.period}: revenue ${h.revenueEur.toLocaleString("es-ES")} € | EBITDA ${h.ebitdaEur.toLocaleString("es-ES")} € | coste op ${h.operatingCostEur.toLocaleString("es-ES")} € | cash ${h.cashAvailableEur.toLocaleString("es-ES")} €`,
    );
    historicoBlock = `HISTÓRICO (${overview.historico.length} meses):\n${lines.join("\n")}`;
  }

  const cityLines = cities.cities.map(
    (c) =>
      `  - ${c.ciudad}: ${c.comercialesActivos} comerciales | facturación: ${c.facturacionMes.toLocaleString("es-ES")} € | ops/mes: ${c.operacionesMes} | rentabilidad/comercial: ${c.rentabilidadPorComercial.toLocaleString("es-ES")} €`,
  );
  const citiesBlock = `CIUDADES OPERATIVAS:\n${cityLines.join("\n")}`;

  const autoLines = automatizaciones.map(
    (a) => {
      const ahorro = a.ahorro_horas * a.coste_hora_eur;
      const roi = ((ahorro - a.coste_mensual_eur) / a.coste_mensual_eur * 100).toFixed(0);
      return `  - ${a.nombre}: coste ${a.coste_mensual_eur} €/mes, ahorro ${a.ahorro_horas}h × ${a.coste_hora_eur} €/h = ${ahorro} €/mes → ROI ${roi}%`;
    },
  );
  const autoBlock = `AUTOMATIZACIONES IMPLEMENTADAS:\n${autoLines.join("\n")}`;

  return [kpiBlock, semaforosBlock, operBlock, equipoBlock, historicoBlock, citiesBlock, autoBlock].join("\n\n");
}

// ── Fallback para datos insuficientes ───────────────────────────────────────

function buildFallbackFinancial(): CeoFinancialRecommendation {
  return {
    costes_fijos_eur: 0,
    costes_variables_eur: 0,
    coste_por_operacion_eur: 0,
    ratio_fijo_variable: 0,
    automatizaciones: AUTOMATIZACIONES_ASUMIDAS.map((a) => {
      const ahorro = a.ahorro_horas * a.coste_hora_eur;
      return {
        nombre: a.nombre,
        coste_mensual_eur: a.coste_mensual_eur,
        ahorro_mensual_eur: ahorro,
        roi_percent: ((ahorro - a.coste_mensual_eur) / a.coste_mensual_eur) * 100,
      };
    }),
    roi_automatizaciones_total: 0,
    capacidad_reinversion_eur: 0,
    recomendaciones: [
      {
        categoria: "tecnologia",
        importe_eur: 0,
        justificacion: "Sin datos financieros suficientes para recomendar reinversiones.",
        prioridad: "baja",
        horizonte_meses: 6,
      },
    ],
    semaforo_financiero: "rojo",
    resumen_ejecutivo:
      "Sin datos financieros suficientes para realizar el análisis. Acción requerida: verificar pipeline de datos.",
    confidence: 0.1,
    reasoning:
      "Fallback automático: sin datos financieros significativos (facturación 0, coste operativo 0). No se invocó LLM.",
  };
}

// ── Nodo de análisis ────────────────────────────────────────────────────────

async function financialNode(
  state: CeoFinStateType,
): Promise<Partial<CeoFinStateType>> {
  const input = state.input;

  const hasUsefulData =
    input.overview.kpis.facturacionMensual.value > 0 ||
    input.overview.kpis.costeOperativo.value > 0;

  if (!hasUsefulData) {
    return { recommendation: buildFallbackFinancial() };
  }

  try {
    const userContent = serializeInputForPrompt(input);

    const raw = await withRetry(() =>
      llmStructured.invoke([
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Analiza la estructura financiera de Urus Capital Group y genera tus recomendaciones de reinversión:\n\n${userContent}`,
        },
      ]),
    );

    const recommendation: CeoFinancialRecommendation = {
      costes_fijos_eur: raw.costes_fijos_eur,
      costes_variables_eur: raw.costes_variables_eur,
      coste_por_operacion_eur: raw.coste_por_operacion_eur,
      ratio_fijo_variable: raw.ratio_fijo_variable,
      automatizaciones: raw.automatizaciones,
      roi_automatizaciones_total: raw.roi_automatizaciones_total,
      capacidad_reinversion_eur: raw.capacidad_reinversion_eur,
      recomendaciones: raw.recomendaciones,
      semaforo_financiero: raw.semaforo_financiero,
      resumen_ejecutivo: raw.resumen_ejecutivo,
      confidence: raw.confidence,
      reasoning: raw.reasoning,
    };

    return { recommendation };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      error: `Error analizando finanzas: ${msg}`,
    };
  }
}

// ── Grafo compilado ─────────────────────────────────────────────────────────

export const ceoFinancialGraph = new StateGraph(CeoFinancialState)
  .addNode("analizar_finanzas", financialNode)
  .addEdge(START, "analizar_finanzas")
  .addEdge("analizar_finanzas", END)
  .compile();

// ── Función de entrada pública ──────────────────────────────────────────────

export async function generateCeoFinancial(
  input: CeoFinancialInput,
): Promise<CeoFinancialRecommendation> {
  const result = await ceoFinancialGraph.invoke({ input });

  if (result.error) {
    throw new Error(result.error);
  }

  if (!result.recommendation) {
    throw new Error("El agente financiero no produjo recomendación");
  }

  return result.recommendation;
}
