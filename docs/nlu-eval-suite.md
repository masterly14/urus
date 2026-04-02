# Suite de Evaluacion AI-to-AI para NLU

## Que es

Sistema automatizado de evaluacion del agente NLU de LangGraph. Tres agentes interactuan:

1. **Agente Comprador Sintetico** (gpt-4o-mini): genera mensajes de WhatsApp realistas segun una persona y un escenario.
2. **Agente NLU bajo test** (classifyBuyerFeedback): el sistema real que se evalua.
3. **Agente Juez** (gpt-4o): evalua la calidad del resultado del NLU por multiples dimensiones.

Los resultados se persisten en Neon y se visualizan en `/eval`.

## Como ejecutar

```bash
# Suite completa (~28 escenarios, ~$0.30)
npm run eval:nlu -- --name "pre-deploy-v2.1"

# Filtrar por categoria
npm run eval:nlu -- --name "property-test" --category property_resolution

# Filtrar por persona
npm run eval:nlu -- --name "coloquial-stress" --persona coloquial

# Solo N escenarios (prueba rapida)
npm run eval:nlu -- --name "quick" --limit 5

# Mayor concurrencia
npm run eval:nlu -- --name "fast" --concurrency 5
```

## UI Dashboard

Accede a `http://localhost:3000/eval` para ver:
- Lista de runs con avg score y status
- Detalle por run: KPIs, charts por categoria, charts por persona, tabla de resultados, top fallos

## Categorias de escenarios

| Categoria | Que evalua | Escenarios |
|-----------|-----------|------------|
| property_resolution | Resolver referencias ambiguas a propiedades concretas | 6 |
| sentiment_accuracy | Clasificar sentimiento por propiedad correctamente | 5 |
| variable_extraction | Extraer variables de demanda del texto | 5 |
| wants_more_detection | Detectar cuando el comprador pide mas opciones | 4 |
| multi_turn | Funcionar con historial conversacional | 3 |
| ambiguity_handling | Manejar texto ambiguo, errores, mezcla de idiomas | 4 |

## Buyer Personas

| ID | Estilo |
|----|--------|
| directo | Claro, sin rodeos |
| coloquial | Informal, expresiones coloquiales |
| indeciso | Vago, sin decision |
| exigente | Muchos criterios especificos |
| multi | Opina sobre varias propiedades |
| numerico | Usa posiciones ("la segunda") |
| emocional | Lenguaje subjetivo |
| cortador | Rechaza todo, pide mas |

## KPIs medidos

| KPI | Que mide | Target |
|-----|---------|--------|
| Overall Score | Ponderado de todos los scores | >= 0.85 |
| Property Resolution | Identificacion correcta de propiedades | >= 85% |
| Sentiment Accuracy | Clasificacion correcta de sentimiento | >= 90% |
| Variable Extraction | Extraccion correcta de variables de demanda | >= 80% |
| Intention Accuracy | Intencion global correcta | >= 90% |
| Wants More Detection | Detecta "quiero mas opciones" | >= 90% |
| Hallucination Rate | Propiedades inventadas | <= 5% |
| Avg Latency | Tiempo de respuesta del NLU | <= 5s |

## Como agregar escenarios

1. Elegir la categoria del escenario
2. Abrir `lib/eval/scenarios/<categoria>.ts`
3. Agregar un objeto `EvalScenario` al array exportado
4. Usar propiedades de `MOCK_PROPERTIES` o definir nuevas en `mock-properties.ts`
5. Asignar una persona de `lib/eval/personas.ts`
6. Definir `buyerInstructions` (que debe decir el comprador sintetico)
7. Definir `expectedOutcome` (ground truth parcial)

## Estructura de archivos

```
lib/eval/
  types.ts                         -- Tipos del dominio
  personas.ts                      -- 8 buyer personas
  buyer-agent.ts                   -- Agente comprador (gpt-4o-mini)
  judge.ts                         -- Agente juez (determinista + gpt-4o)
  orchestrator.ts                  -- Ejecuta runs completos
  scenarios/
    index.ts                       -- Registry de escenarios
    mock-properties.ts             -- Propiedades mock compartidas
    property-resolution.ts         -- 6 escenarios
    sentiment-accuracy.ts          -- 5 escenarios
    variable-extraction.ts         -- 5 escenarios
    wants-more.ts                  -- 4 escenarios
    multi-turn.ts                  -- 3 escenarios
    ambiguity.ts                   -- 4 escenarios

app/api/eval/runs/
  route.ts                         -- GET /api/eval/runs
  [runId]/route.ts                 -- GET /api/eval/runs/:id
  [runId]/results/route.ts         -- GET /api/eval/runs/:id/results

app/eval/
  page.tsx                         -- Lista de runs
  [runId]/page.tsx                 -- Detalle de un run

components/eval/
  eval-kpi-card.tsx
  eval-category-chart.tsx
  eval-results-table.tsx

scripts/
  run-nlu-eval.ts                  -- CLI
```

## Variables de entorno

Solo necesita `OPENAI_API_KEY` (ya existente) y `DATABASE_URL` (ya existente).

## Coste estimado por run

~$0.30 (28 escenarios: gpt-4o-mini para buyer + NLU, gpt-4o para juez).

## Referencia en el plan

La suite está descrita en **`docs/plan.md`** en la sección **Implementación consolidada — Microsite, NLU comprador y suite de evaluación IA** (mitigación explícita del riesgo «LangGraph produce outputs inconsistentes»: métricas en DB + regresión antes de deploy).
