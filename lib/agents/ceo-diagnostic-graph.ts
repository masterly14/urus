/**
 * M13 — Grafo LangGraph: datos consolidados de la empresa → diagnóstico
 * estratégico + recomendaciones (contratar / expandir / intervenir_proceso /
 * redistribuir_leads / formacion / ajustar_incentivos / reducir_costes / investigar).
 *
 * Recibe CeoDiagnosticInput (Capas 1+2, Dashboard Comercial, Alertas, Colaboradores)
 * y produce CeoDiagnosticRecommendation con structured output validado por Zod.
 */

import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { llm } from "./llm";
import { withRetry } from "./utils/retry";
import {
  CeoDiagnosticSchema,
  type CeoDiagnosticRecommendation,
} from "@/lib/dashboard/ceo/diagnostic-types";
import type { CeoOverviewPayload } from "@/lib/dashboard/ceo/types";
import type { CeoCityPerformancePayload } from "@/lib/dashboard/ceo/types";
import type { ComercialesDashboardRow } from "@/lib/dashboard/comercial/queries";
import type { ClassifiedRow } from "@/lib/dashboard/comercial/classify";

// ── Tipos de input ──────────────────────────────────────────────────────────

export interface CeoDiagnosticInput {
  overview: CeoOverviewPayload;
  cities: CeoCityPerformancePayload;
  comerciales: {
    rows: ComercialesDashboardRow[];
    classified: ClassifiedRow[];
  };
  alertas: Array<{
    id: string;
    comercialNombre: string;
    type: string;
    severity: string;
    metric: string;
    message: string;
  }>;
  colaboradoresResumen: string | null;
}

// ── LLM con output estructurado ────────────────────────────────────────────

const llmStructured = llm.withStructuredOutput(CeoDiagnosticSchema, {
  name: "generar_diagnostico_ceo",
});

// ── Estado del grafo ────────────────────────────────────────────────────────

const CeoDiagnosticState = Annotation.Root({
  input: Annotation<CeoDiagnosticInput>,
  recommendation: Annotation<CeoDiagnosticRecommendation | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  error: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
});

type CeoDiagStateType = typeof CeoDiagnosticState.State;

// ── System prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres un asesor estratégico experto en el mercado inmobiliario español. Trabajas para Urus Capital Group, una empresa inmobiliaria con operaciones en Córdoba, Málaga y Sevilla.

Tu tarea es analizar todos los datos operativos y financieros de la empresa y generar un diagnóstico estratégico con recomendaciones concretas y justificadas con cifras.

REGLAS DE DECISIÓN:

1. CONTRATAR:
   - Carga media de comerciales > 85% de la capacidad máxima en una ciudad → recomendar contratar.
   - Si una ciudad tiene más de 50 propiedades activas por comercial → saturación, contratar.

2. EXPANDIR:
   - Facturación estable o creciente + margen ≥ 15% + cash disponible ≥ 50.000 € → oportunidad de expandir.
   - Ciudad con alta rentabilidad por comercial y baja competencia → expandir.

3. INTERVENIR PROCESO:
   - Conversión baja (lead→visita < 30% o visita→cierre < 15%) con alto volumen de leads → proceso ineficiente.
   - Leads perdidos > 40% en una ciudad → intervenir.

4. FORMACIÓN:
   - Comerciales clasificados como "bajo_rendimiento_estructural" → formación o reasignación.
   - Alta dispersión de rendimiento en el equipo → estandarizar formación.

5. REDISTRIBUIR LEADS:
   - Desbalance de carga entre ciudades o comerciales (ratio >2x entre mejor y peor) → redistribuir.
   - Leads perdidos concentrados en comerciales específicos → reasignar.

6. AJUSTAR INCENTIVOS:
   - Comerciales "productivo_ineficiente" con alto volumen pero bajo margen → ajustar incentivos hacia calidad.
   - Top performers con riesgo de rotación (carga excesiva) → retención.

7. REDUCIR COSTES:
   - Coste operativo / revenue > 80% → alarma, reducir costes.
   - EBITDA negativo o descendente → intervención urgente.

8. INVESTIGAR:
   - Datos insuficientes para una métrica o ciudad → investigar antes de decidir.
   - Anomalías no explicables por los datos disponibles → investigar.

INSTRUCCIONES:
- El diagnóstico general DEBE citar cifras concretas: facturación, EBITDA, margen, datos por ciudad.
- Cada recomendación DEBE incluir datos de soporte con cifras reales del input.
- Nombrar ciudades y comerciales específicos cuando aplique.
- Priorizar: primero intervenciones urgentes (rojo), luego optimización (amarillo), finalmente crecimiento (verde).
- El resumen ejecutivo es para el CEO: máximo 2 frases directas.
- El semáforo global refleja el estado general: verde (todo bien), amarillo (atención), rojo (urgente).
- Si los datos son insuficientes o incoherentes, decirlo explícitamente.

FORMATO:
- Diagnóstico general: 3-5 frases en español, tono profesional y directo.
- Recomendaciones: 1-10 items ordenados por prioridad.
- Resumen ejecutivo: 2 frases directas para el CEO.
- Todo en español.`;

// ── Serialización del input para el prompt ──────────────────────────────────

function serializeInputForPrompt(input: CeoDiagnosticInput): string {
  const { overview, cities, comerciales, alertas, colaboradoresResumen } = input;
  const k = overview.kpis;

  const kpiBlock = `KPIS FINANCIEROS (Capa 1):
- Facturación mensual: ${k.facturacionMensual.value.toLocaleString("es-ES")} € (var: ${k.facturacionMensual.changePercent ?? "—"}%)
- Facturación trimestral: ${k.facturacionTrimestral.value.toLocaleString("es-ES")} €
- EBITDA: ${k.ebitda.value.toLocaleString("es-ES")} € (var: ${k.ebitda.changePercent ?? "—"}%)
- Coste operativo: ${k.costeOperativo.value.toLocaleString("es-ES")} €
- Margen por operación: ${k.margenPorOperacion.value.toFixed(1)}%
- Cash disponible: ${k.cashDisponible.value.toLocaleString("es-ES")} €
- Capacidad reinversión: ${k.capacidadReinversion.value.toLocaleString("es-ES")} €`;

  const semaforosBlock = `SEMÁFOROS:
- Facturación: ${overview.semaforos.facturacion}
- Equipo: ${overview.semaforos.equipo}
- Expansión: ${overview.semaforos.expansion}
- Costes: ${overview.semaforos.costes}`;

  const equipoBlock = `EQUIPO:
- Comerciales activos: ${overview.equipo.comercialesActivos}
- Alertas abiertas: ${overview.equipo.alertasAbiertas}
- Carga media: ${overview.equipo.cargaMedia}%
- Operaciones activas: ${overview.operaciones.activas}
- Cerradas este mes: ${overview.operaciones.cerradasMes}`;

  const cityLines = cities.cities.map(
    (c) =>
      `  - ${c.ciudad}: ${c.comercialesActivos} comerciales | carga: ${c.cargaMedia.toFixed(0)}% | propiedades: ${c.propiedadesActivas} | ops/mes: ${c.operacionesMes} | facturación: ${c.facturacionMes.toLocaleString("es-ES")} € | rentabilidad/comercial: ${c.rentabilidadPorComercial.toLocaleString("es-ES")} € | coste oportunidad: ${c.costeOportunidadTotal.toLocaleString("es-ES")} € (leads perdidos: ${c.costeOportunidadLeadsPerdidos.toLocaleString("es-ES")} €, capacidad ociosa: ${c.costeOportunidadCapacidadOciosa.toLocaleString("es-ES")} €)`,
  );
  const citiesBlock = `RENDIMIENTO POR CIUDAD (Capa 2):\n${cityLines.join("\n")}`;

  const comercialLines = comerciales.classified.slice(0, 15).map(
    (c, i) =>
      `  ${i + 1}. ${c.comercialNombre} (${c.ciudad}) | perfil: ${c.classification.profile} | leads: ${c.leadsAssigned} | visitas: ${c.visits} | cierres: ${c.closings} | revenue: ${c.estimatedRevenueEur.toLocaleString("es-ES")} € | conv L→V: ${(c.conversionLeadToVisit * 100).toFixed(0)}% | conv V→C: ${(c.conversionVisitToClose * 100).toFixed(0)}% | leads perdidos: ${(c.lostLeadRate * 100).toFixed(0)}%`,
  );
  const comercialesBlock = `COMERCIALES (Dashboard Comercial):\n${comercialLines.join("\n")}`;

  let alertasBlock = "ALERTAS ABIERTAS: ninguna";
  if (alertas.length > 0) {
    const alertLines = alertas.slice(0, 10).map(
      (a) => `  - [${a.severity.toUpperCase()}] ${a.comercialNombre}: ${a.message} (tipo: ${a.type}, métrica: ${a.metric})`,
    );
    alertasBlock = `ALERTAS ABIERTAS (${alertas.length}):\n${alertLines.join("\n")}`;
  }

  let colabBlock = "COLABORADORES EXTERNOS: sin diagnóstico disponible.";
  if (colaboradoresResumen) {
    colabBlock = `COLABORADORES EXTERNOS (último diagnóstico):\n${colaboradoresResumen}`;
  }

  return [kpiBlock, semaforosBlock, equipoBlock, citiesBlock, comercialesBlock, alertasBlock, colabBlock].join(
    "\n\n",
  );
}

// ── Fallback para datos insuficientes ───────────────────────────────────────

function buildFallbackDiagnostic(): CeoDiagnosticRecommendation {
  return {
    diagnostico_general:
      "No hay datos operativos suficientes para generar un diagnóstico estratégico. " +
      "Las métricas de facturación, equipo y ciudades no contienen información significativa.",
    recomendaciones: [
      {
        tipo: "investigar",
        ciudad: null,
        mensaje:
          "Los datos disponibles son insuficientes para emitir recomendaciones. " +
          "Verificar que los módulos de ingesta, operaciones y dashboard comercial están activos y con datos.",
        datos_soporte: ["Facturación: 0 €", "Comerciales activos: 0", "Operaciones: 0"],
        accion_sugerida:
          "Revisar el pipeline de datos: ingesta de propiedades, creación de operaciones y asignación de comerciales.",
        impacto_esperado:
          "Una vez los datos estén disponibles, el sistema generará diagnósticos estratégicos automáticamente.",
        prioridad: "alta",
      },
    ],
    resumen_ejecutivo:
      "Sin datos suficientes para diagnosticar. Acción requerida: verificar el pipeline de datos.",
    semaforo_global: "rojo",
    confidence: 0.1,
    reasoning:
      "Fallback automático: sin datos significativos (facturación 0, comerciales 0 o ciudades vacías). No se invocó LLM.",
  };
}

// ── Nodo de diagnóstico ─────────────────────────────────────────────────────

async function diagnosticNode(
  state: CeoDiagStateType,
): Promise<Partial<CeoDiagStateType>> {
  const input = state.input;

  const hasUsefulData =
    input.overview.equipo.comercialesActivos > 0 ||
    input.overview.kpis.facturacionMensual.value > 0 ||
    input.cities.cities.some((c) => c.operacionesMes > 0);

  if (!hasUsefulData) {
    return { recommendation: buildFallbackDiagnostic() };
  }

  try {
    const userContent = serializeInputForPrompt(input);

    const raw = await withRetry(() =>
      llmStructured.invoke([
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Analiza los siguientes datos de Urus Capital Group y genera tu diagnóstico estratégico con recomendaciones:\n\n${userContent}`,
        },
      ]),
    );

    const recommendation: CeoDiagnosticRecommendation = {
      diagnostico_general: raw.diagnostico_general,
      recomendaciones: raw.recomendaciones,
      resumen_ejecutivo: raw.resumen_ejecutivo,
      semaforo_global: raw.semaforo_global,
      confidence: raw.confidence,
      reasoning: raw.reasoning,
    };

    return { recommendation };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      error: `Error generando diagnóstico CEO: ${msg}`,
    };
  }
}

// ── Grafo compilado ─────────────────────────────────────────────────────────

export const ceoDiagnosticGraph = new StateGraph(CeoDiagnosticState)
  .addNode("diagnosticar", diagnosticNode)
  .addEdge(START, "diagnosticar")
  .addEdge("diagnosticar", END)
  .compile();

// ── Función de entrada pública ──────────────────────────────────────────────

export async function generateCeoDiagnostic(
  input: CeoDiagnosticInput,
): Promise<CeoDiagnosticRecommendation> {
  const result = await ceoDiagnosticGraph.invoke({ input });

  if (result.error) {
    throw new Error(result.error);
  }

  if (!result.recommendation) {
    throw new Error("El agente de diagnóstico CEO no produjo recomendación");
  }

  return result.recommendation;
}
