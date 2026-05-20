/**
 * Señales conversacionales del agente comprador-Urus.
 *
 * Este módulo concentra la heurística determinista sobre el texto del
 * comprador y el historial reciente del agente, para complementar al LLM y
 * mitigar bucles ("resumir + preguntar si quiere afinar" repetido sin
 * avanzar a una búsqueda real).
 *
 * Todas las funciones son puras y sin side-effects, para poder testearlas
 * de forma aislada y reutilizarlas desde el handler, el sandbox y los
 * orquestadores de evaluación.
 */
import type { ConversationTurn } from "./types";

export type CriteriaField = "ciudad_o_zona" | "presupuesto" | "habitaciones" | "tipo";

export interface DemandCriteriaSnapshot {
  ciudad?: string | null;
  zonas?: string[] | string | null;
  presupuestoMin?: number | null;
  presupuestoMax?: number | null;
  habitacionesMin?: number | null;
  tipos?: string[] | string | null;
}

export interface ConversationSignals {
  /** El comprador tiene los mínimos para que el sistema empiece a buscar. */
  hasMinimumCriteria: boolean;
  /** Campos vacíos que serían útiles para acotar más (no bloqueantes). */
  missingHelpfulFields: CriteriaField[];
  /** Cuántas respuestas del bot consecutivas (al final del historial) son "resumen + ¿quieres seguir?". */
  recentSummaryStreak: number;
  /** El último mensaje del bot invitó a proceder a buscar opciones. */
  lastBotInvitedToProceed: boolean;
  /** El último mensaje del bot ya prometió que se iba a buscar/encolar selección. */
  lastBotPromisedSearch: boolean;
  /** El comprador, en este turno, está pidiendo opciones de forma explícita. */
  buyerAskedForOptions: boolean;
  /** El comprador confirma proceder ("sí", "vale", "ok") justo después de una invitación a buscar. */
  buyerConfirmedToProceed: boolean;
  /** El comprador pide hablar con un humano. */
  buyerRequestedHuman: boolean;
}

// ── Normalización ───────────────────────────────────────────────────────────

function normalize(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[¡¿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Detectores sobre el mensaje del comprador ──────────────────────────────

/** Solo confirmación corta ("ok", "vale", "sí", "perfecto"...). */
export function isMinimalAffirmation(raw: string): boolean {
  const collapsed = raw
    .normalize("NFKC")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.,!?…\s]+/u, "")
    .replace(/[.,!?…\s]+$/u, "")
    .toLowerCase();
  if (!collapsed || /\d/u.test(collapsed)) return false;
  return /^(ok|okey|okay|vale|sí|si|perfecto|genial|de acuerdo|claro|adelante|dale|venga)$/u.test(
    collapsed,
  );
}

/** Pide ver opciones / propiedades de forma explícita. */
export function isAskingForOptions(raw: string): boolean {
  const t = normalize(raw);
  if (!t) return false;
  const patterns: RegExp[] = [
    /\bmas opciones\b/u,
    /\botras opciones\b/u,
    /\bensename\b/u,
    /\b(muestrame|mostrarme)\b/u,
    /\bque opciones (tienes|hay)\b/u,
    /\bque (mas|otra cosa) tienes\b/u,
    /\bque me (ofreces|ensenas|mandas|envias|propones)\b/u,
    /\bhay algo (mas|nuevo)\b/u,
    /\bno (hay|tienes) (mas|algo mas|nada mas)\b/u,
    /\b(busca|buscame)\b/u,
    /\bquiero ver (mas|otras|propiedades|opciones|pisos|casas)\b/u,
    /\b(mandame|envia(?:me)?) (algo|opciones|propuestas)\b/u,
    /\b(adelante|empezamos|empieza|comencemos|comienza)\b.*\bbusqueda\b/u,
    /\bdame (opciones|alternativas|propuestas)\b/u,
  ];
  return patterns.some((rx) => rx.test(t));
}

/** Pide hablar con un humano de forma explícita. */
export function isRequestingHuman(raw: string): boolean {
  const t = normalize(raw);
  if (!t) return false;
  return (
    /\bhablar con (alguien|una persona|un humano|un comercial|un agente|un asesor)\b/u.test(t) ||
    /\b(quiero|necesito) (un|una|hablar con) (comercial|agente|asesor|persona|humano)\b/u.test(t) ||
    /\bpasame (con )?(un|una)? ?(comercial|agente|asesor|persona|humano)\b/u.test(t) ||
    /\bque me llame\b/u.test(t)
  );
}

// ── Detectores sobre el último mensaje del bot ─────────────────────────────

/** El bot acaba de invitar a buscar / preparar opciones ("si quieres te preparo opciones"). */
export function botInvitedToProceed(text: string): boolean {
  const t = normalize(text);
  if (!t) return false;
  const invitation =
    /\bsi quieres\b/u.test(t) ||
    /\b¿?(quieres|prefieres) que\b/u.test(t) ||
    /\bdime si (quieres|seguimos)\b/u.test(t);
  const subject =
    /\b(opciones|propuestas|alternativas|busqueda|buscar|mas)\b/u.test(t) ||
    /\b(te (mando|paso|preparo)|empezamos|seguimos afinando)\b/u.test(t);
  return invitation && subject;
}

/**
 * El bot ya prometió encolar/preparar/buscar una selección ("te preparo más
 * opciones", "te las busco", "voy a por ello", "lanzo la búsqueda", "te las
 * paso en X min"). Cubre el wording IA-first sin referencias a revisor humano.
 */
export function botPromisedSearch(text: string): boolean {
  const t = normalize(text);
  if (!t) return false;
  const promisesAction =
    /\b(te preparo|preparando|estoy preparando|voy a preparar|vamos a preparar|lanzo la busqueda|voy a por ello|te las (busco|preparo|paso|mando|envio|monto)|las busco|las preparo|las monto|monto la (busqueda|seleccion))\b/u.test(t);
  const mentionsSubject =
    /\b(opciones|propuestas|alternativas|seleccion|busqueda|casas|pisos|propiedades|viviendas|mas)\b/u.test(t);
  const mentionsEta = /\b\d{1,3}\s*minutos\b/u.test(t) && /\b(llega|llegan|paso|mando|envio|preparo|tienes)/u.test(t);
  return (promisesAction && mentionsSubject) || mentionsEta;
}

/** El bot está repitiendo el patrón "resumo lo que tengo + ¿quieres seguir?". */
export function isSummaryAndAskOutbound(text: string): boolean {
  const t = normalize(text);
  if (!t) return false;
  const isSummary =
    /\b(tengo apuntad[oa]|me quedo con|tengo (el )?(presupuesto|resumen)|asi que tengo|tengo apuntada|para confirmar)\b/u.test(t);
  const isAskingPermission =
    /\b(si quieres|quieres ajustar|quieres (que )?(siga|sigamos)|sigo afinando|te preparo opciones|¿?lo dejamos asi|quieres que mire|quieres que (busque|prepare))\b/u.test(t);
  return isSummary && isAskingPermission;
}

/** Cuenta cuántos de los últimos N turnos del bot son "resumen + ¿quieres?". */
export function countTrailingSummaryStreak(history: ConversationTurn[]): number {
  let streak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn.role !== "system") continue;
    if (isSummaryAndAskOutbound(turn.text)) {
      streak += 1;
      continue;
    }
    break;
  }
  return streak;
}

// ── Estado de criterios de demanda ─────────────────────────────────────────

function hasNonEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some((v) => hasNonEmpty(v));
  return Boolean(value);
}

/**
 * Mínimos para empezar a buscar: zona o ciudad + al menos 1 criterio adicional
 * (presupuesto, habitaciones o tipología). Igual que el "criterios suficientes"
 * documentado en `docs/analisis-flujo-nlu-demanda-cruces-automaticos.md` §3.
 */
export function evaluateCriteria(snapshot: DemandCriteriaSnapshot | null | undefined): {
  hasMinimumCriteria: boolean;
  missingHelpfulFields: CriteriaField[];
} {
  if (!snapshot) {
    return {
      hasMinimumCriteria: false,
      missingHelpfulFields: ["ciudad_o_zona", "presupuesto", "habitaciones", "tipo"],
    };
  }
  const hasZona = hasNonEmpty(snapshot.ciudad) || hasNonEmpty(snapshot.zonas);
  const hasPresupuesto = hasNonEmpty(snapshot.presupuestoMin) || hasNonEmpty(snapshot.presupuestoMax);
  const hasHabitaciones = hasNonEmpty(snapshot.habitacionesMin);
  const hasTipo = hasNonEmpty(snapshot.tipos);

  const additionalCount =
    Number(hasPresupuesto) + Number(hasHabitaciones) + Number(hasTipo);

  const hasMinimumCriteria = hasZona && additionalCount >= 1;

  const missingHelpfulFields: CriteriaField[] = [];
  if (!hasZona) missingHelpfulFields.push("ciudad_o_zona");
  if (!hasPresupuesto) missingHelpfulFields.push("presupuesto");
  if (!hasHabitaciones) missingHelpfulFields.push("habitaciones");
  if (!hasTipo) missingHelpfulFields.push("tipo");

  return { hasMinimumCriteria, missingHelpfulFields };
}

// ── API principal ──────────────────────────────────────────────────────────

export interface ComputeSignalsInput {
  messageText: string;
  conversationHistory: ConversationTurn[];
  demandCriteria: DemandCriteriaSnapshot | null;
}

export function computeConversationSignals(
  input: ComputeSignalsInput,
): ConversationSignals {
  const { messageText, conversationHistory, demandCriteria } = input;
  const lastSystem = [...conversationHistory].reverse().find((t) => t.role === "system");
  const lastBotText = lastSystem?.text ?? "";

  const buyerAskedForOptions = isAskingForOptions(messageText);
  const buyerConfirmation = isMinimalAffirmation(messageText);
  const lastBotInvitedToProceedFlag = botInvitedToProceed(lastBotText);
  const lastBotPromisedSearchFlag = botPromisedSearch(lastBotText);

  const { hasMinimumCriteria, missingHelpfulFields } = evaluateCriteria(demandCriteria);

  return {
    hasMinimumCriteria,
    missingHelpfulFields,
    recentSummaryStreak: countTrailingSummaryStreak(conversationHistory),
    lastBotInvitedToProceed: lastBotInvitedToProceedFlag,
    lastBotPromisedSearch: lastBotPromisedSearchFlag,
    buyerAskedForOptions,
    buyerConfirmedToProceed: buyerConfirmation && lastBotInvitedToProceedFlag,
    buyerRequestedHuman: isRequestingHuman(messageText),
  };
}

/**
 * Decide si el handler debe forzar la búsqueda determinista cuando el LLM
 * no llamó a ninguna tool de búsqueda. El criterio busca cubrir tres
 * situaciones canónicas:
 *  1. El comprador pide explícitamente opciones (independientemente del bucle).
 *  2. El comprador confirma "sí" después de que el bot invitara a buscar.
 *  3. El bot lleva ≥2 turnos seguidos resumiendo y preguntando sin avanzar
 *     y ya hay criterios mínimos para arrancar la búsqueda.
 */
export function shouldForceSearchFallback(params: {
  signals: ConversationSignals;
  hasSelection: boolean;
  agentInvokedSearchTool: boolean;
}): { force: boolean; reason: "buyer_asked" | "buyer_confirmed" | "loop_detected" | null } {
  if (params.agentInvokedSearchTool) return { force: false, reason: null };
  if (params.hasSelection) return { force: false, reason: null };

  const { signals } = params;

  if (signals.buyerAskedForOptions) {
    return { force: true, reason: "buyer_asked" };
  }
  if (signals.buyerConfirmedToProceed) {
    return { force: true, reason: "buyer_confirmed" };
  }
  if (signals.recentSummaryStreak >= 2 && signals.hasMinimumCriteria) {
    return { force: true, reason: "loop_detected" };
  }
  return { force: false, reason: null };
}
