/**
 * M13 — Grafo LangGraph: KPIs financieros + costes + automatizaciones →
 * análisis de control financiero con recomendaciones de reinversión.
 *
 * Recibe CeoFinancialInput (Capas 1+2, automatizaciones asumidas) y produce
 * CeoFinancialRecommendation con structured output validado por Zod.
 */

import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { llm } from "./llm";
import {
  CeoFinancialSchema,
  type CeoFinancialRecommendation,
} from "@/lib/dashboard/ceo/financial-types";
import type { CeoOverviewPayload, CeoCityPerformancePayload } from "@/lib/dashboard/ceo/types";

// ── Tipos de input ──────────────────────────────────────────────────────────

export interface AutomationAssumed {
  nombre: string;
  coste_mensual_eur: number;
  ahorro_horas_mes: number;
  coste_hora_eur: number;
}

export interface CeoFinancialInput {
  overview: CeoOverviewPayload;
  cities: CeoCityPerformancePayload;
  automatizaciones: AutomationAssumed[];
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

const SYSTEM_PROMPT = `Eres un director financiero experto en empresas inmobiliarias en España. Trabajas para Urus Capital Group, que opera en Córdoba, Málaga y Sevilla (Andalucía).

Tu tarea es realizar un análisis de control financiero completo: evaluar la estructura de costes, cuantificar el ROI de las automatizaciones activas, determinar la capacidad de reinversión segura y recomendar cómo distribuir esa inversión.

ANÁLISIS DE COSTES:

Recibirás datos del snapshot mensual con costes fijos y variables. Si los datos de snapshot son 0 (no cargados manualmente aún), infiere valores razonables a partir de la facturación y el EBITDA:
- Costes totales estimados = facturación - EBITDA
- Reparto típico en inmobiliarias: 60-70% fijos (sueldos, oficinas), 30-40% variables (comisiones, marketing)
- Coste por operación = costes totales / operaciones cerradas

RATIO FIJO/VARIABLE:
- Si ratio > 0.7: rigidez alta → riesgo en meses bajos → señal de alerta
- Si ratio 0.5-0.7: estructura equilibrada
- Si ratio < 0.5: alta variabilidad → flexible pero dependiente del volumen

ROI DE AUTOMATIZACIONES:
Para cada automatización recibida, calcula:
- Ahorro mensual = ahorro_horas_mes × coste_hora_eur
- ROI = ((ahorro_mensual - coste_mensual) / coste_mensual) * 100
- Comenta el impacto cualitativo (operativo, comercial, financiero)
- Calcula ROI total ponderado por inversión

CAPACIDAD DE REINVERSIÓN SEGURA:
- Fórmula: cash_disponible - (3 × coste_operativo_mensual)
- Si es negativo → reinversión 0, semáforo rojo
- Si es positivo pero < 20% del cash → semáforo amarillo, reinversión conservadora
- Si es positivo y > 20% del cash → semáforo verde, reinversión activa recomendada

RECOMENDACIONES DE REINVERSIÓN:
Distribuye la capacidad de reinversión entre categorías prioritarias. Considera:
1. TECNOLOGÍA: si ROI de automatizaciones es alto (> 500%) → ampliar automatizaciones
2. EQUIPO: si hay déficit de comerciales (carga > 80%) → contratar
3. CIUDAD: si hay ciudad con rentabilidad/comercial muy alta → reforzar
4. MARKETING: si facturación está por debajo del target → invertir en captación
5. FORMACIÓN: si hay comerciales en riesgo → formación y coaching

SEMÁFORO FINANCIERO:
- VERDE: EBITDA > 0 + costes bajo control (ratio < 0.7) + cash suficiente (> 3 meses costes)
- AMARILLO: uno de los criterios anteriores en zona de precaución
- ROJO: EBITDA negativo O cash insuficiente (< 2 meses costes) O costes descontrolados

INSTRUCCIONES:
- Cita cifras concretas del input para cada cálculo.
- Si hay datos del snapshot (fixedCostsEur > 0, variableCostsEur > 0), úsalos directamente.
- Si los datos del snapshot son 0, infiere valores y señálalo en el reasoning.
- El resumen ejecutivo es para el CEO: máximo 2 frases directas, tono ejecutivo.
- Ser concreto: importe exacto de reinversión por categoría, no rangos vagos.
- Todo en español, tono profesional.`;

// ── Serialización del input para el prompt ──────────────────────────────────

function serializeInputForPrompt(input: CeoFinancialInput): string {
  const { overview, cities, automatizaciones } = input;
  const k = overview.kpis;

  const kpiBlock = `KPIS FINANCIEROS ACTUALES:
- Facturación mensual: ${k.facturacionMensual.value.toLocaleString("es-ES")} € (var: ${k.facturacionMensual.changePercent?.toFixed(1) ?? "—"}%)
- Facturación trimestral: ${k.facturacionTrimestral.value.toLocaleString("es-ES")} €
- EBITDA estimado: ${k.ebitda.value.toLocaleString("es-ES")} € (var: ${k.ebitda.changePercent?.toFixed(1) ?? "—"}%)
- Coste operativo mensual: ${k.costeOperativo.value.toLocaleString("es-ES")} €
- Margen por operación: ${k.margenPorOperacion.value.toFixed(1)}%
- Cash disponible: ${k.cashDisponible.value.toLocaleString("es-ES")} €
- Capacidad reinversión (snapshot): ${k.capacidadReinversion.value.toLocaleString("es-ES")} €`;

  const semaforosBlock = `SEMÁFOROS ACTUALES:
- Facturación: ${overview.semaforos.facturacion}
- Equipo: ${overview.semaforos.equipo}
- Expansión: ${overview.semaforos.expansion}
- Costes: ${overview.semaforos.costes}`;

  const operacionesBlock = `OPERACIONES:
- Activas: ${overview.operaciones.activas}
- Cerradas este mes: ${overview.operaciones.cerradasMes}
- Comerciales activos: ${overview.equipo.comercialesActivos}
- Carga media: ${overview.equipo.cargaMedia}%
- Alertas abiertas: ${overview.equipo.alertasAbiertas}`;

  let snapshotBlock = "SNAPSHOT MENSUAL (costes desglosados): sin datos manuales cargados — inferir a partir de facturación/EBITDA.";
  // The overview KPIs already carry the snapshot values via getCeoOverview
  // We rely on costeOperativo to infer fixed/variable split if snapshot is zeroed

  let historicoBlock = "HISTÓRICO 6 MESES: sin datos disponibles.";
  if (overview.historico.length > 0) {
    const lines = overview.historico.map(
      (h) =>
        `  - ${h.period}: revenue ${h.revenueEur.toLocaleString("es-ES")} € | target ${h.targetRevenueEur.toLocaleString("es-ES")} € | EBITDA ${h.ebitdaEur.toLocaleString("es-ES")} € | costes op. ${h.operatingCostEur.toLocaleString("es-ES")} € | cash ${h.cashAvailableEur.toLocaleString("es-ES")} €`,
    );
    historicoBlock = `HISTÓRICO (${overview.historico.length} meses):\n${lines.join("\n")}`;
  }

  const cityLines = cities.cities.map(
    (c) =>
      `  - ${c.ciudad}: ${c.comercialesActivos} comerciales | carga: ${c.cargaMedia.toFixed(0)}% | ops/mes: ${c.operacionesMes} | facturación: ${c.facturacionMes.toLocaleString("es-ES")} € | rentabilidad/comercial: ${c.rentabilidadPorComercial.toLocaleString("es-ES")} €`,
  );
  const citiesBlock = `RENDIMIENTO POR CIUDAD:\n${cityLines.length > 0 ? cityLines.join("\n") : "  Sin datos por ciudad."}`;

  const autoLines = automatizaciones.map(
    (a) =>
      `  - ${a.nombre}: coste ${a.coste_mensual_eur}€/mes | ahorro ${a.ahorro_horas_mes}h × ${a.coste_hora_eur}€/h = ${a.ahorro_horas_mes * a.coste_hora_eur}€/mes`,
  );
  const autoBlock = `AUTOMATIZACIONES ACTIVAS (valores asumidos):\n${autoLines.join("\n")}`;

  return [
    kpiBlock,
    semaforosBlock,
    operacionesBlock,
    snapshotBlock,
    historicoBlock,
    citiesBlock,
    autoBlock,
  ].join("\n\n");
}

// ── Fallback para datos insuficientes ───────────────────────────────────────

function buildFallbackFinancial(): CeoFinancialRecommendation {
  return {
    costes_fijos_eur: 0,
    costes_variables_eur: 0,
    coste_por_operacion_eur: 0,
    ratio_fijo_variable: 0,
    automatizaciones: [
      {
        nombre: "Sin datos",
        coste_mensual_eur: 0,
        ahorro_mensual_eur: 0,
        roi_percent: 0,
        comentario: "No hay datos financieros suficientes para calcular el ROI de automatizaciones.",
      },
    ],
    roi_automatizaciones_total: 0,
    capacidad_reinversion_eur: 0,
    recomendaciones: [
      {
        categoria: "tecnologia",
        importe_eur: 0,
        justificacion:
          "Sin datos financieros no es posible recomendar reinversión. Cargar snapshot mensual para activar el análisis.",
        prioridad: "alta",
        horizonte_meses: 1,
      },
    ],
    semaforo_financiero: "rojo",
    resumen_ejecutivo:
      "Sin datos financieros suficientes para análisis. Acción requerida: cargar snapshot mensual con costes y EBITDA.",
    confidence: 0.1,
    reasoning:
      "Fallback automático: facturación 0, sin operaciones cerradas. No se invocó LLM.",
  };
}

// ── Nodo de análisis ─────────────────────────────────────────────────────────

async function financialNode(
  state: CeoFinStateType,
): Promise<Partial<CeoFinStateType>> {
  const input = state.input;

  const hasUsefulData =
    input.overview.kpis.facturacionMensual.value > 0 ||
    input.overview.kpis.costeOperativo.value > 0 ||
    input.overview.equipo.comercialesActivos > 0;

  if (!hasUsefulData) {
    return { recommendation: buildFallbackFinancial() };
  }

  try {
    const userContent = serializeInputForPrompt(input);

    const raw = await llmStructured.invoke([
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Realiza el análisis de control financiero de Urus Capital Group con los siguientes datos y genera las recomendaciones de reinversión:\n\n${userContent}`,
      },
    ]);

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
    throw new Error("El agente financiero no produjo análisis");
  }

  return result.recommendation;
}
