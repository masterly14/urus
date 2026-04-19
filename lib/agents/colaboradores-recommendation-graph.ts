/**
 * M11 — Grafo LangGraph: datos de flota de colaboradores → diagnóstico textual
 * + recomendaciones estratégicas (concentrar / reducir / alertar / reconocer / investigar).
 *
 * Recibe un DashboardColaboradoresPayload y produce ColaboradoresRecommendation
 * con structured output validado por Zod.
 */

import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { llm } from "./llm";
import { withRetry } from "./utils/retry";
import {
  ColaboradoresRecommendationSchema,
  type ColaboradoresRecommendation,
} from "@/lib/operacion/colaboradores/recommendation-types";
import type {
  DashboardColaboradoresPayload,
  ColaboradorDashboardRow,
  TipoMetricas,
} from "@/lib/operacion/colaboradores/dashboard-queries";

// ── LLM con output estructurado ───────────────────────────────────────────────

const llmStructured = llm.withStructuredOutput(
  ColaboradoresRecommendationSchema,
  { name: "generar_recomendacion_colaboradores" },
);

// ── Estado del grafo ─────────────────────────────────────────────────────────

const ColaboradoresRecommendationState = Annotation.Root({
  input: Annotation<DashboardColaboradoresPayload>,
  recommendation: Annotation<ColaboradoresRecommendation | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  error: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
});

type ColabRecoStateType = typeof ColaboradoresRecommendationState.State;

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres un asesor experto en gestión operativa de colaboradores externos para una empresa inmobiliaria española (Urus Capital Group).

Tu tarea es analizar los datos de toda la flota de colaboradores externos (abogados, tasadores, bancos, notarías, etc.) y generar recomendaciones estratégicas para optimizar la asignación de operaciones y mejorar el rendimiento global.

CONTEXTO:
- Los colaboradores se clasifican automáticamente: partner_estrategico (SLA≥90%, volumen alto), funcional (SLA≥70%), lento (SLA 50-70%), critico (SLA<50% o bloqueos recurrentes), sin_datos (pocas asignaciones).
- La facturación vinculada es el importe bruto de las operaciones donde el colaborador participa.
- El SLA mide el % de hitos completados dentro del plazo definido.
- Los hitos vencidos son tareas que excedieron su deadline y siguen pendientes.

REGLAS DE DECISIÓN:
- Si existen partners estratégicos con alta facturación y SLA excelente: recomendar CONCENTRAR más operaciones en ellos. Citar nombres y cifras.
- Si existen colaboradores críticos con operaciones activas: recomendar ALERTAR con urgencia. Cuantificar la facturación en riesgo y sugerir intervención.
- Si existen colaboradores lentos con carga significativa: recomendar REDUCIR su volumen y redistribuir a partners. Cuantificar el ahorro de tiempo.
- Si existen partners con rendimiento excepcional: RECONOCER su contribución, considerar acuerdos preferenciales.
- Si hay colaboradores sin_datos: recomendar INVESTIGAR si tienen potencial o si deben ser desactivados.
- Si hay hitos vencidos acumulados: alertar sobre el riesgo sistémico.
- Considerar la distribución por tipo: si todos los colaboradores de un tipo son lentos/críticos, alertar sobre un problema estructural de ese tipo.

INSTRUCCIONES:
- El diagnóstico DEBE citar: SLA global, número de partners vs críticos, facturación total vinculada, hitos vencidos totales.
- Las recomendaciones deben ser específicas: nombres de colaboradores, cifras concretas, acciones ejecutables.
- Priorizar por impacto: primero alertas críticas, luego optimización, finalmente investigación.
- El resumen ejecutivo es para el CEO: máximo 2 frases con la información más relevante.
- Si la flota está en buen estado (mayoría partners/funcionales, SLA alto, sin vencidos), decirlo explícitamente con recomendaciones de mantenimiento.

FORMATO:
- Diagnóstico: 2-4 frases en español, tono profesional.
- Recomendaciones: 1-8 items ordenados por prioridad.
- Resumen ejecutivo: 1-2 frases directas para el CEO.`;

// ── Serialización del payload para el prompt ─────────────────────────────────

function serializePayloadForPrompt(
  payload: DashboardColaboradoresPayload,
): string {
  const { resumen, ranking, metricasPorTipo } = payload;
  const dist = resumen.distribucionClasificacion;

  const colabLines = ranking.slice(0, 20).map((c: ColaboradorDashboardRow, i: number) => {
    const cls = c.clasificacion.clasificacion;
    return `  ${i + 1}. ${c.nombre} | tipo: ${c.tipo} | ciudad: ${c.ciudad || "—"} | clasificación: ${cls} | SLA: ${c.slaCumplimiento}% | facturación: ${c.facturacionVinculadaEur.toLocaleString("es-ES")} € | ops vinculadas: ${c.operacionesVinculadasCount} | hitos: ${c.hitosCompletados}/${c.hitosTotales} | vencidos: ${c.hitosVencidos} | avg días/hito: ${c.avgDiasHito ?? "—"}`;
  });

  const tipoLines = metricasPorTipo.map((t: TipoMetricas) =>
    `  - ${t.tipo}: ${t.totalColaboradores} colaboradores | SLA medio: ${t.avgSlaCumplimiento}% | avg días/hito: ${t.avgDiasHito ?? "—"} | hitos vencidos: ${t.hitosVencidos} | facturación: ${t.facturacionVinculadaEur.toLocaleString("es-ES")} €`,
  );

  return `RESUMEN GLOBAL DE LA FLOTA:
- Total colaboradores activos: ${resumen.totalActivos}
- SLA cumplimiento global: ${resumen.slaCumplimientoGlobal}%
- Hitos vencidos totales: ${resumen.hitosVencidosTotales}
- Facturación vinculada total: ${resumen.facturacionTotal.toLocaleString("es-ES")} €
- Distribución por clasificación:
  - Partners estratégicos: ${dist.partner_estrategico}
  - Funcionales: ${dist.funcional}
  - Lentos: ${dist.lento}
  - Críticos: ${dist.critico}
  - Sin datos: ${dist.sin_datos}

MÉTRICAS POR TIPO DE COLABORADOR:
${tipoLines.join("\n")}

RANKING DE COLABORADORES (top ${colabLines.length}):
${colabLines.join("\n")}`;
}

// ── Fallback para datos insuficientes ────────────────────────────────────────

function buildFallbackRecommendation(): ColaboradoresRecommendation {
  return {
    diagnostico:
      "No hay colaboradores activos suficientes para generar un análisis significativo. " +
      "El ecosistema de colaboradores externos aún no tiene datos operativos.",
    recomendaciones: [
      {
        tipo: "investigar",
        mensaje:
          "No se encontraron colaboradores activos con asignaciones. Verificar que el panel de colaboradores está poblado.",
        colaboradores_afectados: [],
        accion_sugerida:
          "Acceder a /colaboradores y crear/activar colaboradores con asignaciones a operaciones reales.",
        impacto_esperado:
          "Una vez haya datos, el sistema generará recomendaciones estratégicas automáticamente.",
        prioridad: "alta",
      },
    ],
    resumen_ejecutivo:
      "Sin datos suficientes de colaboradores externos. Acción requerida: poblar el panel.",
    confidence: 0.1,
    reasoning:
      "Fallback automático: 0 colaboradores activos o todos sin_datos. No se invocó LLM.",
  };
}

// ── Nodo de recomendación ─────────────────────────────────────────────────────

async function recommendNode(
  state: ColabRecoStateType,
): Promise<Partial<ColabRecoStateType>> {
  const payload = state.input;

  const hasUsefulData =
    payload.resumen.totalActivos > 0 &&
    payload.ranking.some(
      (c) => c.clasificacion.clasificacion !== "sin_datos",
    );

  if (!hasUsefulData) {
    return { recommendation: buildFallbackRecommendation() };
  }

  try {
    const userContent = serializePayloadForPrompt(payload);

    const raw = await withRetry(() =>
      llmStructured.invoke([
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Analiza la siguiente flota de colaboradores externos y genera tus recomendaciones estratégicas:\n\n${userContent}`,
        },
      ]),
    );

    const recommendation: ColaboradoresRecommendation = {
      diagnostico: raw.diagnostico,
      recomendaciones: raw.recomendaciones,
      resumen_ejecutivo: raw.resumen_ejecutivo,
      confidence: raw.confidence,
      reasoning: raw.reasoning,
    };

    return { recommendation };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      error: `Error generando recomendación de colaboradores: ${msg}`,
    };
  }
}

// ── Grafo compilado ───────────────────────────────────────────────────────────

export const colaboradoresRecommendationGraph = new StateGraph(
  ColaboradoresRecommendationState,
)
  .addNode("recomendar", recommendNode)
  .addEdge(START, "recomendar")
  .addEdge("recomendar", END)
  .compile();

// ── Función de entrada pública ────────────────────────────────────────────────

export async function generateColaboradoresRecommendation(
  payload: DashboardColaboradoresPayload,
): Promise<ColaboradoresRecommendation> {
  const result = await colaboradoresRecommendationGraph.invoke({
    input: payload,
  });

  if (result.error) {
    throw new Error(result.error);
  }

  if (!result.recommendation) {
    throw new Error(
      "El agente de colaboradores no produjo recomendación",
    );
  }

  return result.recommendation;
}
