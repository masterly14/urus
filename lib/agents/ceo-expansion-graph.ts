/**
 * M13 — Grafo LangGraph: datos financieros/operativos → evaluación de readiness
 * para expansión geográfica + recomendación de ciudades candidatas.
 *
 * Recibe CeoExpansionInput (Capas 1+2, comerciales clasificados) y produce
 * CeoExpansionRecommendation con structured output validado por Zod.
 */

import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { llm } from "./llm";
import {
  CeoExpansionSchema,
  type CeoExpansionRecommendation,
} from "@/lib/dashboard/ceo/expansion-types";
import type { CeoOverviewPayload, CeoCityPerformancePayload } from "@/lib/dashboard/ceo/types";
import type { ClassifiedRow } from "@/lib/dashboard/comercial/classify";

// ── Tipos de input ──────────────────────────────────────────────────────────

export interface CeoExpansionInput {
  overview: CeoOverviewPayload;
  cities: CeoCityPerformancePayload;
  classified: ClassifiedRow[];
}

// ── LLM con output estructurado ────────────────────────────────────────────

const llmStructured = llm.withStructuredOutput(CeoExpansionSchema, {
  name: "evaluar_expansion",
});

// ── Estado del grafo ────────────────────────────────────────────────────────

const CeoExpansionState = Annotation.Root({
  input: Annotation<CeoExpansionInput>,
  recommendation: Annotation<CeoExpansionRecommendation | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  error: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
});

type CeoExpStateType = typeof CeoExpansionState.State;

// ── System prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres un estratega experto en expansión de empresas inmobiliarias en España. Trabajas para Urus Capital Group, que actualmente opera en Córdoba, Málaga y Sevilla (Andalucía).

Tu tarea es evaluar si la empresa está lista para expandirse a nuevas ciudades y, si lo está, recomendar las mejores ciudades candidatas del mercado inmobiliario español.

CRITERIOS DE READINESS (evalúa los 5):

1. FACTURACIÓN ESTABLE: el histórico de 6 meses debe mostrar tendencia no descendente. Si hay datos de al menos 3 meses con revenue estable o creciente → cumplido. Si hay oscilaciones pero la media es positiva → parcial. Si hay tendencia claramente descendente → no_cumplido.

2. MARGEN OPERATIVO >= 15%: si el margen por operación es >= 15% → cumplido. Entre 10% y 15% → parcial. < 10% → no_cumplido.

3. CASH DISPONIBLE >= 50.000 €: si cash >= 50.000 € → cumplido. Entre 30.000 € y 50.000 € → parcial. < 30.000 € → no_cumplido.

4. PROCESOS ESTABLES: evalúa la ratio alertas/comerciales y la carga media. Si alertas < 25% del equipo Y carga media < 80% → cumplido. Si una de las dos condiciones falla → parcial. Si ambas fallan → no_cumplido.

5. CAPACIDAD DE LIDERAZGO: evalúa cualitativamente el equipo. Si hay comerciales top_performer en al menos 2 ciudades y el equipo no está saturado (carga < 85%) → cumplido. Si hay top_performers pero con carga alta → parcial. Si no hay top_performers o el equipo está sobrecargado → no_cumplido.

REGLAS DE DECISIÓN:

- >= 4 criterios cumplidos → readiness "apto". Recomendar 2-4 ciudades candidatas con plan de expansión.
- 3 criterios cumplidos → readiness "parcial". Recomendar 1-2 ciudades pero indicar qué criterios resolver primero.
- < 3 criterios → readiness "no_apto". No recomendar ciudades. Indicar plan de estabilización.

CIUDADES CANDIDATAS (si aplica):

Considera ciudades españolas con mercado inmobiliario activo fuera de Andalucía (Valencia, Alicante, Madrid, Barcelona, Murcia, Zaragoza, Valladolid) y dentro (Granada, Cádiz, Jaén, Huelva, Almería). Para cada una estima:

- Puntuación (1-10) basada en: tamaño del mercado, competencia, proximidad logística a las oficinas actuales, ticket medio esperado
- Inversión estimada: coste de apertura de oficina + primeros 6 meses de nóminas + marketing local
- Break-even: meses estimados según ticket medio del mercado y volumen esperado
- Comerciales iniciales: equipo mínimo para arrancar
- Riesgos: máximo 3 principales

Prioriza ciudades con proximidad geográfica a Andalucía (menor coste logístico y de gestión) salvo que la oportunidad de mercado justifique otra opción.

INSTRUCCIONES:

- Citar cifras concretas del input para cada criterio.
- Los valores actuales deben reflejar los datos reales proporcionados, no inventados.
- El plan de expansión debe ser concreto: ciudad preferida, timeline, equipo, inversión.
- El resumen ejecutivo es para el CEO: máximo 2 frases directas.
- Ser conservador: la expansión debe ser consecuencia lógica de fortaleza demostrada.
- Todo en español, tono profesional.`;

// ── Serialización del input para el prompt ──────────────────────────────────

function serializeInputForPrompt(input: CeoExpansionInput): string {
  const { overview, cities, classified } = input;
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

  const equipoBlock = `EQUIPO:
- Comerciales activos: ${overview.equipo.comercialesActivos}
- Alertas abiertas: ${overview.equipo.alertasAbiertas}
- Carga media: ${overview.equipo.cargaMedia}%
- Operaciones activas: ${overview.operaciones.activas}
- Cerradas este mes: ${overview.operaciones.cerradasMes}`;

  let historicoBlock = "HISTÓRICO 6 MESES: sin datos disponibles.";
  if (overview.historico.length > 0) {
    const lines = overview.historico.map(
      (h) =>
        `  - ${h.period}: revenue ${h.revenueEur.toLocaleString("es-ES")} € | target ${h.targetRevenueEur.toLocaleString("es-ES")} € | EBITDA ${h.ebitdaEur.toLocaleString("es-ES")} € | cash ${h.cashAvailableEur.toLocaleString("es-ES")} €`,
    );
    historicoBlock = `HISTÓRICO (${overview.historico.length} meses):\n${lines.join("\n")}`;
  }

  const cityLines = cities.cities.map(
    (c) =>
      `  - ${c.ciudad}: ${c.comercialesActivos} comerciales | carga: ${c.cargaMedia.toFixed(0)}% | propiedades: ${c.propiedadesActivas} | ops/mes: ${c.operacionesMes} | facturación: ${c.facturacionMes.toLocaleString("es-ES")} € | rentabilidad/comercial: ${c.rentabilidadPorComercial.toLocaleString("es-ES")} €`,
  );
  const citiesBlock = `CIUDADES OPERATIVAS ACTUALES:\n${cityLines.join("\n")}`;

  const comercialLines = classified.slice(0, 15).map(
    (c, i) =>
      `  ${i + 1}. ${c.comercialNombre} (${c.ciudad}) | perfil: ${c.classification.profile} | leads: ${c.leadsAssigned} | cierres: ${c.closings} | revenue: ${c.estimatedRevenueEur.toLocaleString("es-ES")} €`,
  );
  const comercialesBlock = `EQUIPO COMERCIAL (clasificado):\n${comercialLines.join("\n")}`;

  const topPerformers = classified.filter((c) => c.classification.profile === "top_performer");
  const topBlock = `TOP PERFORMERS: ${topPerformers.length} de ${classified.length} comerciales clasificados como top_performer.`;

  return [kpiBlock, semaforosBlock, equipoBlock, historicoBlock, citiesBlock, comercialesBlock, topBlock].join(
    "\n\n",
  );
}

// ── Fallback para datos insuficientes ───────────────────────────────────────

function buildFallbackExpansion(): CeoExpansionRecommendation {
  return {
    readiness_global: "no_apto",
    criterios_evaluados: [
      {
        nombre: "Datos operativos",
        estado: "no_cumplido",
        valor_actual: "Sin datos",
        umbral: "Datos mínimos requeridos",
        comentario: "No hay datos financieros ni operativos suficientes para evaluar la readiness de expansión.",
      },
    ],
    ciudades_recomendadas: [],
    plan_expansion:
      "No se recomienda expansión en este momento. Se requieren datos financieros y operativos mínimos para evaluar.",
    resumen_ejecutivo:
      "Sin datos suficientes para evaluar expansión. Acción requerida: verificar pipeline de datos financieros.",
    confidence: 0.1,
    reasoning:
      "Fallback automático: sin datos significativos (facturación 0, comerciales 0). No se invocó LLM.",
  };
}

// ── Nodo de evaluación ──────────────────────────────────────────────────────

async function expansionNode(
  state: CeoExpStateType,
): Promise<Partial<CeoExpStateType>> {
  const input = state.input;

  const hasUsefulData =
    input.overview.equipo.comercialesActivos > 0 ||
    input.overview.kpis.facturacionMensual.value > 0;

  if (!hasUsefulData) {
    return { recommendation: buildFallbackExpansion() };
  }

  try {
    const userContent = serializeInputForPrompt(input);

    const raw = await llmStructured.invoke([
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Evalúa la readiness de expansión geográfica de Urus Capital Group con los siguientes datos y genera tu recomendación:\n\n${userContent}`,
      },
    ]);

    const recommendation: CeoExpansionRecommendation = {
      readiness_global: raw.readiness_global,
      criterios_evaluados: raw.criterios_evaluados,
      ciudades_recomendadas: raw.ciudades_recomendadas,
      plan_expansion: raw.plan_expansion,
      resumen_ejecutivo: raw.resumen_ejecutivo,
      confidence: raw.confidence,
      reasoning: raw.reasoning,
    };

    return { recommendation };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      error: `Error evaluando expansión: ${msg}`,
    };
  }
}

// ── Grafo compilado ─────────────────────────────────────────────────────────

export const ceoExpansionGraph = new StateGraph(CeoExpansionState)
  .addNode("evaluar_expansion", expansionNode)
  .addEdge(START, "evaluar_expansion")
  .addEdge("evaluar_expansion", END)
  .compile();

// ── Función de entrada pública ──────────────────────────────────────────────

export async function generateCeoExpansion(
  input: CeoExpansionInput,
): Promise<CeoExpansionRecommendation> {
  const result = await ceoExpansionGraph.invoke({ input });

  if (result.error) {
    throw new Error(result.error);
  }

  if (!result.recommendation) {
    throw new Error("El agente de expansión no produjo recomendación");
  }

  return result.recommendation;
}
