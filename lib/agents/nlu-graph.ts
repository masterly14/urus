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

// El interés positivo (ME_INTERESA) NO se infiere por NLU desde texto libre:
// se captura exclusivamente con el botón "Me encaja" del micrositio. Por eso
// `sentiment` aquí queda restringido a `NO_ME_ENCAJA`.
const PropertyFeedbackSchema = z.object({
  propertyId: z.string().describe("ID exacto de la propiedad del listado."),
  sentiment: z.literal("NO_ME_ENCAJA").describe(
    "Solo se modela el rechazo a una propiedad. El interés positivo " +
    "se captura por el botón 'Me encaja' del micrositio, NUNCA por NLU.",
  ),
});

const ContextualNLUOutputSchema = z.object({
  intention: z.enum(["NO_ME_ENCAJA", "BUSCO_DIFERENTE", "OTRO"]).describe(
    "Intención global del mensaje:\n" +
    "- NO_ME_ENCAJA: el comprador rechaza propiedades del listado o expresa " +
    "criterios nuevos porque lo mostrado no le encaja.\n" +
    "- BUSCO_DIFERENTE: pide un cambio de búsqueda radicalmente distinto.\n" +
    "- OTRO: cualquier otro caso (preguntas, agradecimientos, mensajes " +
    "neutros, expresiones de interés positivo en texto libre). Cuando el " +
    "comprador exprese que algo le gusta SIN haber pulsado el botón " +
    "'Me encaja' del micrositio, usa OTRO y el sistema le invitará a usar " +
    "el botón. Nunca emitas ME_ENCAJA ni intentes inferir ME_INTERESA por " +
    "texto libre."
  ),
  confidence: z.number().min(0).max(1).describe("Confianza 0–1."),
  propertyFeedback: z.array(PropertyFeedbackSchema).describe(
    "Una entrada por propiedad del listado que el comprador RECHACE sin " +
    "ambigüedad (sentiment=NO_ME_ENCAJA). NO se modela el interés positivo " +
    "(eso lo captura el botón del micrositio). " +
    "Si el comprador no señala una propiedad concreta del listado, array vacío. " +
    "Si dudas entre dos IDs o entre incluir o no, array vacío. " +
    "Ordinales, 'la de [extra único]', precio que solo coincide con una fila, " +
    "o 'ninguna' sí permiten mapear como rechazo."
  ),
  variables: VariablesSchema.describe("Variables de demanda extraídas."),
  wantsMoreOptions: z.boolean().describe(
    "true si el comprador pide ver más propiedades, otras opciones, o algo nuevo."
  ),
  reasoning: z.string().describe("Razonamiento breve para auditoría."),
});

const SimpleNLUOutputSchema = z.object({
  intention: z.enum(["NO_ME_ENCAJA", "BUSCO_DIFERENTE", "OTRO"]).describe(
    "Intención del comprador (sin ME_ENCAJA: el interés positivo se captura " +
    "por el botón 'Me encaja' del micrositio, no por NLU).",
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

function getContextualClassifier() {
  return llm.withStructuredOutput(ContextualNLUOutputSchema, {
    name: "clasificar_feedback_comprador",
  });
}

function getSimpleClassifier() {
  return llm.withStructuredOutput(SimpleNLUOutputSchema, {
    name: "clasificar_respuesta_whatsapp",
  });
}

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

REGLA CARDINAL — interés positivo:
El interés positivo del comprador hacia una propiedad concreta ("me encaja", "me gusta", "esta sí", "me la quedo") NO se captura por este NLU. Existe un botón "Me encaja" en CADA ficha del micrositio que es el ÚNICO canal canónico para registrar interés. Por tanto:
- NUNCA emitas la intención ME_ENCAJA (de hecho no es un valor permitido).
- NUNCA pongas sentiment=ME_INTERESA en propertyFeedback (solo se permite NO_ME_ENCAJA).
- Si el comprador expresa interés positivo en texto libre, devuelve intention=OTRO con un reasoning que indique que debe pulsar el botón "Me encaja" en la ficha. El handler le contestará invitándole a usarlo.

Tu tarea:
1. Identificar qué propiedad(es) del listado RECHAZA el comprador (referencia directa, posición, zona, precio, característica). Usa el propertyId exacto del listado.
2. Marcar sentiment=NO_ME_ENCAJA para esas propiedades (es el único valor permitido en propertyFeedback).
3. Determinar la intención global (NO_ME_ENCAJA, BUSCO_DIFERENTE u OTRO).
4. Extraer variables de demanda si el comprador indica ajustes (presupuesto, zona, metros, habitaciones, extras, etc.).
5. Detectar si pide ver más opciones (wantsMoreOptions).

PROPIEDADES (propertyFeedback) — evitar sobrerresolución:
- Incluye un propertyId SOLO si el comprador RECHAZA esa fila del listado de forma clara: ordinales ("la primera no me convence"), "la de la piscina" cuando solo una tiene piscina, precio mencionado que desempata a una sola fila, título o rasgo único que una sola cumple, o "ninguna" (en cuyo caso incluye todas las del listado con NO_ME_ENCAJA).
- NO añadas entradas porque el mensaje cite una zona, ciudad o rango de precio que "podría" corresponder a una propiedad del listado si el comprador no señala cuál. En ese caso propertyFeedback=[] y, si aplica, rellena solo variables de demanda.
- NO rellenes el array para "ayudar" al sistema: ante la menor duda entre dos IDs o entre poner o no poner, deja propertyFeedback vacío.
- Si el comprador da feedback positivo sobre una propiedad concreta ("me gusta la segunda"), NO la añadas a propertyFeedback. Deja el array vacío y usa intention=OTRO con reasoning que mencione invitarle al botón.

INTENCIÓN GLOBAL — prioridad sobre tono coloquial:
- NO_ME_ENCAJA: hay rechazo, desacuerdo o desajuste con lo mostrado. Usa esta etiqueta si aparece CUALQUIERA de: "no", "paso", "no me convence(n)", "ninguna", "caro/cara", "pequeño/pequeña", "no cumple(n)", "necesito…", "quiero…" con criterios nuevos que implican que lo actual no vale, críticas a tipología o precio.
- BUSCO_DIFERENTE: solo si pide un cambio de búsqueda radicalmente distinto (otro segmento, otro uso, "otra cosa totalmente distinta"). NO lo uses cuando solo ajusta presupuesto, zona, metros, habitaciones o extras: eso es NO_ME_ENCAJA + variables.
- OTRO: mensaje que no rechaza claramente, no pide cambio radical, no expresa interés accionable. Incluye: confirmaciones breves ("ok", "vale", "sí", "perfecto"), agradecimientos, preguntas, mensajes ambiguos, y CUALQUIER expresión de interés positivo en texto libre (porque ese caso debe redirigirse al botón "Me encaja"). En caso de duda entre positivo y negativo, elige NO_ME_ENCAJA solo si hay señales claras de rechazo; si no, OTRO.

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
- Mensaje que es solo confirmación mínima ("ok", "ok.", "vale", "sí", "si", "perfecto", "genial", "de acuerdo", con emoji opcional) → intention=OTRO, propertyFeedback=[], variables vacías. Recuerda: la confirmación no es un sustituto del botón "Me encaja".
- Si en el MISMO mensaje hay confirmación Y rechazo, exigencias, listas de requisitos o críticas → intention=NO_ME_ENCAJA y extrae variables.
- "no", "paso", "nada" sin más contexto → intention=NO_ME_ENCAJA, variables vacías.
- Emojis positivos aislados (👍, 😍, ❤️) sin texto concreto → intention=OTRO (no captures interés positivo aquí). Emojis negativos (👎, 😒) refuerzan rechazo.

VARIABLES RELATIVAS (sin valor numérico concreto):
- "más grande", "más barato", "más céntrico" sin número concreto → NO inventar valores numéricos. Marcar wantsMoreOptions=true si el comprador expresa insatisfacción general sin dar cifras.

REGLAS GENERALES:
- Solo extraer lo que el comprador mencione explícitamente. null para lo no mencionado.
- NUNCA inventar valores numéricos que el comprador no haya dicho.
- Si dice "ninguna", incluye todas las propiedades del listado con sentiment=NO_ME_ENCAJA.
- Si dice "todas me gustan" o similar interés positivo: NO uses propertyFeedback, devuelve intention=OTRO y deja claro en reasoning que el comprador debe pulsar el botón "Me encaja" en cada ficha que quiera.${historyBlock}`;
}

const SIMPLE_SYSTEM_PROMPT = `Eres un asistente de análisis inmobiliario de Urus Capital.
Clasifica la respuesta del comprador en: NO_ME_ENCAJA, BUSCO_DIFERENTE u OTRO.
Extrae variables de demanda ajustada cuando el comprador las mencione.

REGLA CARDINAL — interés positivo:
El interés positivo del comprador hacia una propiedad concreta ("me encaja", "me gusta", "me la quedo") NO se captura por NLU. Existe un botón "Me encaja" en cada ficha del micrositio que es el único canal canónico. Si el comprador expresa interés positivo en texto libre, devuelve intention=OTRO con reasoning que indique que debe pulsar el botón en la ficha. Nunca emitas ME_ENCAJA.

INTENCIÓN:
- NO_ME_ENCAJA: "no", "paso", críticas de precio/tamaño/tipo, criterios nuevos que implican desajuste, o mensaje ambivalente con parte negativa fuerte. Usa esta etiqueta cuando hay señales claras de rechazo o necesidad de ajuste.
- BUSCO_DIFERENTE: cambio de búsqueda totalmente distinto; no la uses para ajustar presupuesto, zona, metros, habitaciones o extras (eso es NO_ME_ENCAJA + variables).
- OTRO: confirmación breve ("ok", "vale", "sí", "perfecto", "genial", "de acuerdo" con emoji opcional), agradecimientos, preguntas, expresiones de interés positivo en texto libre, mensajes neutros o ambiguos sin rechazo claro. Si dudas entre positivo y negativo, elige NO_ME_ENCAJA solo si hay señales claras de rechazo; si no, OTRO.

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
- Solo "ok"/"ok."/"vale"/"sí"/"si"/"perfecto"/"genial"/"de acuerdo" (+ emoji opcional) → intention=OTRO, variables vacías.
- Si el mismo mensaje mezcla confirmación con rechazo o requisitos → NO_ME_ENCAJA + variables.
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

function detectWantsMoreOptionsHeuristic(raw: string): boolean {
  const normalized = raw
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
  if (!normalized) return false;

  const explicitSignals: RegExp[] = [
    /\bmas opciones\b/u,
    /\botras opciones\b/u,
    /\bensename\b/u,
    /\b(muestrame|mostrarme)\b/u,
    /\bque opciones (tienes|hay)\b/u,
    /\bque mas tienes\b/u,
    /\bhay algo mas\b/u,
    /\bbusca(me)? (mas|otra)\b/u,
    /\bquiero ver (mas|otras)\b/u,
    /\bno (hay|tienes) (mas|algo mas)\b/u,
  ];
  if (explicitSignals.some((rx) => rx.test(normalized))) return true;

  // Confirmaciones muy cortas no deben disparar por sí solas.
  if (isMinimalAffirmation(raw)) return false;
  return false;
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
      getContextualClassifier().invoke([
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
      wantsMoreOptions: result.wantsMoreOptions || detectWantsMoreOptionsHeuristic(messageText),
    };

    // Confirmaciones breves ("ok", "vale", "sí", ...) ya no se interpretan
    // como interés positivo: el botón "Me encaja" es el canal canónico para
    // ME_INTERESA. Forzamos intention=OTRO con vars y feedback vacíos para
    // que el handler responda invitando al uso del botón.
    if (isMinimalAffirmation(messageText)) {
      nluResult = {
        ...nluResult,
        intention: "OTRO",
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
      getSimpleClassifier().invoke([
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
      wantsMoreOptions: detectWantsMoreOptionsHeuristic(messageText),
    };

    if (isMinimalAffirmation(messageText)) {
      nluResult = {
        ...nluResult,
        intention: "OTRO",
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
