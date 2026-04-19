/**
 * M5/M6 — Agente NLU de clasificación de respuestas WhatsApp.
 *
 * Dos modos de operación:
 * 1. classifyWhatsAppResponse (legacy): texto libre sin contexto de microsite.
 * 2. classifyBuyerFeedback: texto + propiedades del microsite + historial conversacional.
 *    Resuelve referencias ambiguas ("la del centro", "la barata") a propiedades concretas.
 */

import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { z } from "zod";
import { llm } from "./llm";
import { withRetry } from "./utils/retry";
import type {
  NLUResult,
  NLUGraphInput,
  PropertySummaryForNLU,
  ConversationTurn,
} from "./types";

// ── Schemas Zod ─────────────────────────────────────────────────────────────

const VariablesSchema = z.object({
  precioMin: z.number().nullable().describe("Precio mínimo en euros. null si no lo menciona."),
  precioMax: z.number().nullable().describe("Precio máximo en euros. null si no lo menciona."),
  metrosMin: z.number().nullable().describe("m² mínimos. null si no los menciona."),
  metrosMax: z.number().nullable().describe("m² máximos. null si no los menciona."),
  habitacionesMin: z.number().nullable().describe("Habitaciones mínimas. null si no lo menciona."),
  ciudad: z.string().nullable().describe(
    "Nombre de la ciudad mencionada (ej: 'Córdoba', 'Madrid'). " +
    "Solo el nombre de la ciudad, sin barrios ni zonas. null si no lo menciona.",
  ),
  zonas: z.array(z.string()).nullable().describe(
    "Barrios o zonas dentro de la ciudad (ej: ['Centro', 'La Flota', 'Norte']). " +
    "No incluir el nombre de la ciudad aquí, solo barrios/zonas. null si ninguno.",
  ),
  tipos: z.array(z.string()).nullable().describe(
    "Tipos de inmueble DESEADOS en español normalizado. null si ninguno. " +
    "Sinónimos: 'apartamento'→'piso', 'chalet'→'casa', 'adosado'→'casa adosada', 'loft'→'estudio'. " +
    "Solo incluir tipos que el comprador QUIERE, nunca los que rechaza.",
  ),
  extras: z.array(z.string()).nullable().describe(
    "Extras DESEADOS (garaje, terraza, piscina). null si ninguno. " +
    "Solo incluir extras que el comprador QUIERE, nunca los que rechaza.",
  ),
  extrasNoDeseados: z.array(z.string()).nullable().describe(
    "Extras que el comprador rechaza explícitamente ('sin garaje'→['garaje'], " +
    "'no quiero piscina'→['piscina']). null si no rechaza ninguno.",
  ),
});

const PropertyFeedbackSchema = z.object({
  propertyId: z.string().describe("ID exacto de la propiedad del listado."),
  sentiment: z.enum(["ME_INTERESA", "NO_ME_ENCAJA"]).describe("Sentimiento del comprador hacia esta propiedad."),
});

const ContextualNLUOutputSchema = z.object({
  intention: z.enum(["ME_ENCAJA", "NO_ME_ENCAJA", "BUSCO_DIFERENTE"]).describe(
    "Intención global: ME_ENCAJA si le gustan propiedades, " +
    "NO_ME_ENCAJA si no cumplen sus requisitos, " +
    "BUSCO_DIFERENTE si quiere un cambio completo."
  ),
  confidence: z.number().min(0).max(1).describe("Confianza 0–1."),
  propertyFeedback: z.array(PropertyFeedbackSchema).describe(
    "Una entrada por propiedad que el comprador identifique SIN AMBIGÜEDAD respecto al listado. " +
    "NO incluir filas solo porque comparten zona/precio/ciudad con lo dicho: si no señala cuál del listado, array vacío. " +
    "Si dudas entre dos IDs o entre incluir o no, array vacío. " +
    "Ordinales, 'la de [extra único]', precio que solo coincide con una fila, o 'todas'/'ninguna' sí permiten mapear."
  ),
  variables: VariablesSchema.describe("Variables de demanda extraídas."),
  wantsMoreOptions: z.boolean().describe(
    "true si el comprador pide ver más propiedades, otras opciones, o algo nuevo."
  ),
  reasoning: z.string().describe("Razonamiento breve para auditoría."),
});

const SimpleNLUOutputSchema = z.object({
  intention: z.enum(["ME_ENCAJA", "NO_ME_ENCAJA", "BUSCO_DIFERENTE"]).describe(
    "Intención del comprador."
  ),
  confidence: z.number().min(0).max(1),
  variables: VariablesSchema,
  reasoning: z.string(),
});

// ── Estado del grafo ─────────────────────────────────────────────────────────

const NLUState = Annotation.Root({
  input: Annotation<NLUGraphInput>,
  nluResult: Annotation<NLUResult | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  error: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
});

type NLUStateType = typeof NLUState.State;

// ── LLMs estructurados ──────────────────────────────────────────────────────

const llmContextual = llm.withStructuredOutput(ContextualNLUOutputSchema, {
  name: "clasificar_feedback_comprador",
});

const llmSimple = llm.withStructuredOutput(SimpleNLUOutputSchema, {
  name: "clasificar_respuesta_whatsapp",
});

// ── Prompts ─────────────────────────────────────────────────────────────────

function buildContextualSystemPrompt(
  properties: PropertySummaryForNLU[],
  history: ConversationTurn[],
): string {
  const propsList = properties.map((p, i) => {
    const parts = [`  ${i + 1}. ID: ${p.propertyId}`];
    parts.push(`Título: ${p.title}`);
    if (p.price != null) parts.push(`Precio: ${p.price}€`);
    if (p.zone) parts.push(`Zona: ${p.zone}`);
    if (p.city) parts.push(`Ciudad: ${p.city}`);
    if (p.metersBuilt != null) parts.push(`${p.metersBuilt}m²`);
    if (p.rooms != null) parts.push(`${p.rooms} hab`);
    if (p.extras.length > 0) parts.push(`Extras: ${p.extras.join(", ")}`);
    return parts.join(" | ");
  }).join("\n");

  const historyBlock = history.length > 0
    ? "\n\nHistorial de conversación:\n" + history.map((t) =>
      `[${t.role === "buyer" ? "Comprador" : "Sistema"}]: ${t.text}`
    ).join("\n")
    : "";

  return `Eres un asistente inmobiliario de Urus Capital que analiza mensajes de WhatsApp de compradores.

El comprador está viendo estas propiedades en su microsite personalizado:

${propsList}

Tu tarea:
1. Identificar qué propiedad(es) menciona el comprador (por referencia directa, posición, zona, precio u otra característica). Usa el propertyId exacto del listado.
2. Clasificar el sentimiento por cada propiedad mencionada: ME_INTERESA o NO_ME_ENCAJA.
3. Determinar la intención global (ver reglas abajo).
4. Extraer variables de demanda si el comprador indica ajustes.
5. Detectar si pide ver más opciones (wantsMoreOptions).

PROPIEDADES (propertyFeedback) — evitar sobrerresolución:
- Incluye un propertyId SOLO si el comprador identifica ESA fila del listado de forma clara: ordinales ("la primera", "la segunda"), "la de la piscina" cuando solo una tiene piscina, precio mencionado que desempata a una sola fila, título o rasgo único que una sola cumple, o "todas"/"ninguna".
- NO añadas entradas porque el mensaje cita una zona, ciudad o rango de precio que "podría" corresponder a una propiedad del listado si el comprador no señala cuál. En ese caso propertyFeedback=[] y, si aplica, rellena solo variables de demanda.
- NO rellenes el array para "ayudar" al sistema: ante la menor duda entre dos IDs o entre poner o no poner, deja propertyFeedback vacío.

INTENCIÓN GLOBAL — prioridad sobre tono coloquial:
- ME_ENCAJA: el comprador muestra claramente que le encajan las opciones mostradas (aprobación, entusiasmo, "me quedo con…", "me gusta esta").
- Excepción explícita — acuerdo mínimo: si el mensaje COMPLETO (sin contar espacios finales) es únicamente una confirmación breve —ok, vale, sí, perfecto, genial, de acuerdo— opcionalmente con puntuación o emoji y nada más, entonces intention=ME_ENCAJA y propertyFeedback=[] (no adivines propiedad).
- NO_ME_ENCAJA: hay rechazo, desacuerdo o desajuste con lo mostrado. Usa esta etiqueta si aparece CUALQUIERA de: "no", "paso", "no me convence(n)", "ninguna", "caro/cara", "pequeño/pequeña", "no cumple(n)", "necesito…", "quiero…" con criterios nuevos que implican que lo actual no vale, críticas a tipología o precio, o sentimiento NO_ME_ENCAJA hacia alguna propiedad mencionada sin compensar con un ME_INTERESA claro a otra.
- NO uses ME_ENCAJA si el mensaje mezcla entusiasmo genérico con exigencias o rechazo a lo enseñado. En caso de duda entre positivo y negativo, elige NO_ME_ENCAJA, salvo la excepción de acuerdo mínimo de arriba.
- BUSCO_DIFERENTE: solo si pide un cambio de búsqueda radicalmente distinto (otro segmento, otro uso, "otra cosa totalmente distinta"). NO lo uses cuando solo ajusta presupuesto, zona, metros, habitaciones o extras: eso es NO_ME_ENCAJA (o ME_ENCAJA si además aprueba algo) más variables.

Extracción de variables — reglas estrictas:

UBICACIÓN:
- "ciudad": solo el nombre de la ciudad (ej: "Córdoba", "Madrid"). NUNCA incluir barrios aquí.
- NUNCA rellenar ciudad ni zonas solo porque aparecen en títulos o datos del listado de propiedades: el comprador debe decirlas en su mensaje.
- "zonas": barrios o zonas DENTRO de la ciudad (ej: ["Centro", "Norte", "La Flota"]). NO incluir la ciudad.
- "en el centro de Córdoba" → ciudad="Córdoba", zonas=["Centro"].

PRECIOS (siempre en euros):
- "hasta 200.000" → precioMax=200000. "desde 150.000" → precioMin=150000.
- "entre 150 y 200 mil" → precioMin=150000, precioMax=200000.
- Formatos coloquiales: "200 mil"=200000, "200k"=200000, "doscientos mil"=200000, "medio millón"=500000, "un cuarto de millón"=250000.
- Jerga de precio (España, contexto compra vivienda): "pavos" y "palos" suelen significar miles de euros → "350 pavos" o "350 palos"=350000, "200 pavos"=200000. Si dicen "mil pavos" o "1k pavos", interpreta según contexto (p. ej. "80 mil" explícito = 80000).
- "k" o "K" tras un número siempre multiplica por 1000: "300k"=300000, "1.2M"=1200000.

JERGA INMOBILIARIA (mapear siempre a variables del esquema):
- "cuartos", "habitaciones", "dormitorios", "piezas" (habitaciones) → habitacionesMin cuando indiquen cantidad ("3 cuartos"→habitacionesMin=3).
- "terraza", "balcón", "patio" → extras (ej. extras=["terraza"]). "sin terraza" → extrasNoDeseados.
- "piso" en sentido tipología → tipos=["piso"]; "piso" como planta ("tercer piso") no inventes si no hay campo; puedes ignorar o reflejar solo si el comprador lo usa como filtro claro.

METROS:
- "80 metros", "80m²", "80 m2" → metrosMin o metrosMax según contexto.
- "al menos 80m²" = metrosMin=80. "no más de 100m²" = metrosMax=100.

HABITACIONES:
- "3 habitaciones", "3 dormitorios", "3 cuartos" → habitacionesMin=3.
- "2 o 3 habitaciones" → habitacionesMin=2. "al menos 3" → habitacionesMin=3.

TIPOLOGÍA (normalizar siempre a español estándar):
- Sinónimos obligatorios: "apartamento"→"piso", "chalet"→"casa", "adosado"→"casa adosada", "loft"→"estudio".
- Solo incluir tipos que el comprador QUIERE. Si dice "que no sea ático", NO poner "ático" en tipos.

EXTRAS:
- "extras": solo los que el comprador QUIERE ("con garaje"→extras=["garaje"]).
- "extrasNoDeseados": los que RECHAZA ("sin garaje"→extrasNoDeseados=["garaje"], "no quiero piscina"→extrasNoDeseados=["piscina"]).

RESPUESTAS CORTAS:
- Mensaje que es solo confirmación mínima (una sola intención de sí: "ok", "ok.", "vale", "sí", "si", "perfecto", "genial", "de acuerdo", con emoji opcional) → ME_ENCAJA, propertyFeedback=[], variables sin rellenar salvo que en ese mismo texto pida criterios.
- Si en el MISMO mensaje hay confirmación Y rechazo, exigencias, listas de requisitos o críticas → NO_ME_ENCAJA y extrae variables; no apliques la excepción anterior.
- "no", "paso", "nada" sin más contexto → intention=NO_ME_ENCAJA, variables vacías.
- Emojis positivos (👍, 😍, ❤️) refuerzan sentimiento positivo. Emojis negativos (👎, 😒) refuerzan negativo.

VARIABLES RELATIVAS (sin valor numérico concreto):
- "más grande", "más barato", "más céntrico" sin número concreto → NO inventar valores numéricos. Marcar wantsMoreOptions=true si el comprador expresa insatisfacción general sin dar cifras.

REGLAS GENERALES:
- Solo extraer lo que el comprador mencione explícitamente. null para lo no mencionado.
- NUNCA inventar valores numéricos que el comprador no haya dicho.
- Si dice "todas" o "ninguna", incluye todas las propiedades con el sentimiento correspondiente.${historyBlock}`;
}

const SIMPLE_SYSTEM_PROMPT = `Eres un asistente de análisis inmobiliario de Urus Capital.
Clasifica la respuesta del comprador en: ME_ENCAJA, NO_ME_ENCAJA, BUSCO_DIFERENTE.
Extrae variables de demanda ajustada cuando el comprador las mencione.

INTENCIÓN:
- ME_ENCAJA: aprobación clara sin rechazo ni exigencias que desmonten lo ofrecido.
- Si el mensaje entero es solo "ok"/"vale"/"sí"/"perfecto"/"genial"/"de acuerdo" (+ puntuación o emoji opcional) → ME_ENCAJA.
- NO_ME_ENCAJA: "no", "paso", críticas de precio/tamaño/tipo, criterios nuevos que implican desajuste, o mensaje ambivalente con parte negativa fuerte. Si dudas entre positivo y negativo, NO_ME_ENCAJA, salvo el caso de acuerdo mínimo de una sola línea anterior.
- BUSCO_DIFERENTE: cambio de búsqueda totalmente distinto; no uses solo por ajustar presupuesto, zona, metros, habitaciones o extras.

Reglas de extracción:

UBICACIÓN:
- "ciudad": solo el nombre de la ciudad (ej: "Córdoba"). NUNCA incluir barrios.
- No infieras ciudad ni zonas desde el catálogo: solo si el comprador las dice en el mensaje.
- "zonas": barrios/zonas DENTRO de la ciudad (ej: ["Centro", "Norte"]). NO incluir la ciudad.

PRECIOS (siempre en euros):
- "hasta 200.000" → precioMax=200000. "desde 150.000" → precioMin=150000.
- "entre 150 y 200 mil" → precioMin=150000, precioMax=200000.
- Coloquial: "200 mil"=200000, "200k"=200000, "medio millón"=500000.
- Jerga: "pavos"/"palos" = miles de € → "350 pavos"=350000. "300k"=300000.

METROS Y HABITACIONES:
- "80m²" → metrosMin o metrosMax según contexto ("al menos" = min, "no más de" = max).
- "3 dormitorios" / "3 cuartos" / "3 habitaciones" / "3 piezas" → habitacionesMin=3. "2 o 3" → habitacionesMin=2.

TIPOLOGÍA (normalizar a español estándar):
- "apartamento"→"piso", "chalet"→"casa", "adosado"→"casa adosada", "loft"→"estudio".
- Solo tipos DESEADOS. Si dice "que no sea ático", NO poner "ático" en tipos.

EXTRAS:
- DESEADOS: "con garaje"→extras=["garaje"]; también "terraza", "balcón", "patio" en extras cuando los pida.
- RECHAZADOS: "sin garaje"→extrasNoDeseados=["garaje"]; "sin terraza"→extrasNoDeseados.

RESPUESTAS CORTAS:
- Solo "ok"/"ok."/"vale"/"sí"/"si"/"perfecto"/"genial"/"de acuerdo" (+ emoji opcional) → ME_ENCAJA, variables vacías.
- Si el mismo mensaje mezcla sí con rechazo o requisitos → NO_ME_ENCAJA + variables.
- "no"/"paso"/"nada" sin contexto → NO_ME_ENCAJA, variables vacías.

REGLAS GENERALES:
- Solo lo explícitamente mencionado. null para lo no dicho.
- NUNCA inventar valores numéricos que el comprador no haya dicho.`;

// ── Nodo de clasificación contextual ────────────────────────────────────────

/** Solo confirmación (p. ej. "ok", "vale"): sin cifras ni texto sustantivo tras quitar emoji. */
function isMinimalAffirmation(raw: string): boolean {
  let collapsed = raw
    .normalize("NFKC")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  collapsed = collapsed.replace(/\s*,\s*(gracias|thanks|thx|mil gracias|muchas gracias)\.?$/iu, "").trim();
  collapsed = collapsed.replace(/\s+(gracias|thanks|thx|mil gracias|muchas gracias)\.?$/iu, "").trim();
  const core = collapsed
    .replace(/^[.,!?…\s]+/gu, "")
    .replace(/[.,!?…\s]+$/gu, "")
    .trim()
    .toLowerCase();
  if (!core || /\d/u.test(core)) return false;
  return /^(ok|okey|okay|vale|sí|si|perfecto|genial|de acuerdo)$/u.test(core);
}

function stripNullVars(vars: z.infer<typeof VariablesSchema>) {
  return {
    ...(vars.precioMin != null && { precioMin: vars.precioMin }),
    ...(vars.precioMax != null && { precioMax: vars.precioMax }),
    ...(vars.metrosMin != null && { metrosMin: vars.metrosMin }),
    ...(vars.metrosMax != null && { metrosMax: vars.metrosMax }),
    ...(vars.habitacionesMin != null && { habitacionesMin: vars.habitacionesMin }),
    ...(vars.ciudad != null && { ciudad: vars.ciudad }),
    ...(vars.zonas != null && { zonas: vars.zonas }),
    ...(vars.tipos != null && { tipos: vars.tipos }),
    ...(vars.extras != null && { extras: vars.extras }),
    ...(vars.extrasNoDeseados != null && { extrasNoDeseados: vars.extrasNoDeseados }),
  };
}

async function clasificarContextual(state: NLUStateType): Promise<Partial<NLUStateType>> {
  const { messageText, selectionProperties, conversationHistory } = state.input;
  const properties = selectionProperties ?? [];
  const history = conversationHistory ?? [];

  if (properties.length === 0) {
    return clasificarSimple(state);
  }

  try {
    const systemPrompt = buildContextualSystemPrompt(properties, history);
    const result = await withRetry(() =>
      llmContextual.invoke([
        { role: "system", content: systemPrompt },
        { role: "user", content: messageText },
      ]),
    );

    const validPropertyIds = new Set(properties.map((p) => p.propertyId));
    const feedback = result.propertyFeedback.filter((f) =>
      validPropertyIds.has(f.propertyId),
    );

    let nluResult: NLUResult = {
      intention: result.intention,
      confidence: result.confidence,
      propertyFeedback: feedback,
      variables: stripNullVars(result.variables),
      rawText: messageText,
      reasoning: result.reasoning,
      wantsMoreOptions: result.wantsMoreOptions,
    };

    if (isMinimalAffirmation(messageText)) {
      nluResult = {
        ...nluResult,
        intention: "ME_ENCAJA",
        confidence: Math.max(nluResult.confidence, 0.95),
        propertyFeedback: [],
        variables: {},
        wantsMoreOptions: false,
      };
    }

    return { nluResult };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { error: `Error en clasificación NLU contextual: ${errorMsg}` };
  }
}

async function clasificarSimple(state: NLUStateType): Promise<Partial<NLUStateType>> {
  const { messageText } = state.input;

  try {
    const result = await withRetry(() =>
      llmSimple.invoke([
        { role: "system", content: SIMPLE_SYSTEM_PROMPT },
        { role: "user", content: `Analiza esta respuesta del comprador:\n\n"${messageText}"` },
      ]),
    );

    let nluResult: NLUResult = {
      intention: result.intention,
      confidence: result.confidence,
      propertyFeedback: [],
      variables: stripNullVars(result.variables),
      rawText: messageText,
      reasoning: result.reasoning,
      wantsMoreOptions: false,
    };

    if (isMinimalAffirmation(messageText)) {
      nluResult = {
        ...nluResult,
        intention: "ME_ENCAJA",
        confidence: Math.max(nluResult.confidence, 0.95),
        variables: {},
      };
    }

    return { nluResult };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { error: `Error en clasificación NLU simple: ${errorMsg}` };
  }
}

// ── Grafo compilado ─────────────────────────────────────────────────────────

export const nluGraph = new StateGraph(NLUState)
  .addNode("clasificar", clasificarContextual)
  .addEdge(START, "clasificar")
  .addEdge("clasificar", END)
  .compile();

// ── Funciones de entrada públicas ───────────────────────────────────────────

export async function classifyWhatsAppResponse(
  input: NLUGraphInput,
): Promise<NLUResult> {
  const result = await nluGraph.invoke({ input });

  if (result.error) throw new Error(result.error);
  if (!result.nluResult) throw new Error("El agente NLU no produjo resultado");

  return result.nluResult;
}

export async function classifyBuyerFeedback(
  input: NLUGraphInput,
): Promise<NLUResult> {
  const result = await nluGraph.invoke({ input });

  if (result.error) throw new Error(result.error);
  if (!result.nluResult) throw new Error("El agente NLU no produjo resultado");

  return result.nluResult;
}
