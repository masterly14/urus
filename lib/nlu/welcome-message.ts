/**
 * Construcción del cuerpo de bienvenida del primer contacto NLU.
 *
 * El primer mensaje al comprador (plantilla Meta `nlu_demanda_contacto_inicial`)
 * recibe dos variables: nombre y mensaje. Este módulo construye la variable
 * "mensaje" de forma determinista a partir de los criterios ya cargados de
 * Inmovilla en `DemandCurrent`, sin depender de un LLM.
 *
 * Reglas:
 * - Solo se inyectan datos reales del CRM. Nunca se inventa zona, presupuesto
 *   ni cualquier otro criterio que el comprador no haya proporcionado.
 * - Si los datos están vacíos o sucios, se cae en una variante neutral
 *   (no afirmativa) que sigue invitando a abrir conversación.
 * - El copy es siempre una propuesta a confirmar, no una afirmación cerrada,
 *   para tolerar posibles inconsistencias del CRM.
 */

export interface DemandContextForWelcome {
  nombre: string | null | undefined;
  zonas: string | null | undefined;
  presupuestoMin: number | null | undefined;
  presupuestoMax: number | null | undefined;
  habitacionesMin: number | null | undefined;
  tipos: string | null | undefined;
}

const NEUTRAL_FALLBACK =
  "Para mandarte opciones que de verdad encajen contigo, ¿prefieres que empecemos por zona o por presupuesto?";

function capitalizeWord(word: string): string {
  if (!word) return "";
  if (word === word.toUpperCase()) {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Devuelve el primer nombre del comprador en formato presentable.
 * Trata el caso típico de Inmovilla con todo en mayúsculas
 * (p. ej. "JUAN PÉREZ FERNÁNDEZ" → "Juan").
 */
export function sanitizeFirstName(value: string | null | undefined): string {
  if (!value) return "";
  const first = value.trim().split(/\s+/)[0] ?? "";
  return capitalizeWord(first);
}

/**
 * Extrae la primera zona del campo `zonas` de Inmovilla, que puede venir
 * como CSV ("Centro, Macarena, Triana"). Devuelve null si no hay nada útil.
 */
export function sanitizeFirstZone(zonas: string | null | undefined): string | null {
  if (!zonas || !zonas.trim()) return null;
  const first = zonas
    .split(",")
    .map((z) => z.trim())
    .find((z) => z.length > 0);
  if (!first) return null;
  return capitalizeWord(first);
}

/**
 * Formatea un importe en euros con separador de miles español.
 * Devuelve null si el valor no es válido (<=0).
 */
export function formatPriceEuros(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return `${Math.round(value).toLocaleString("es-ES")}€`;
}

/**
 * Formatea un rango de presupuesto. Si solo hay max, devuelve "200.000€".
 * Si solo hay min, devuelve "desde 150.000€". Si hay ambos, "150.000–200.000€".
 */
export function formatPriceRange(
  min: number | null | undefined,
  max: number | null | undefined,
): string | null {
  const minOk = min != null && Number.isFinite(min) && min > 0;
  const maxOk = max != null && Number.isFinite(max) && max > 0;
  if (!minOk && !maxOk) return null;
  if (minOk && maxOk) {
    return `${Math.round(min!).toLocaleString("es-ES")}–${Math.round(max!).toLocaleString("es-ES")}€`;
  }
  if (maxOk) {
    return `${Math.round(max!).toLocaleString("es-ES")}€`;
  }
  return `desde ${Math.round(min!).toLocaleString("es-ES")}€`;
}

function splitCsv(value: string | null | undefined): string[] {
  if (!value || !value.trim()) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

/**
 * Construye el cuerpo del primer mensaje de WhatsApp.
 *
 * Variantes (en orden de prioridad):
 * - A: zona + presupuesto → confirmación amable de criterios.
 * - B: solo zona → ancla la zona y pregunta presupuesto.
 * - C: solo presupuesto → ancla el tope y pregunta zona.
 * - D: sin datos útiles → invita a empezar por zona o presupuesto.
 *
 * El copy se mantiene corto (≤ ~200 caracteres) para encajar bien en una
 * burbuja de WhatsApp y dentro de los límites de variable de plantilla Meta.
 */
export function buildWelcomeMessage(demand: DemandContextForWelcome): string {
  const zona = sanitizeFirstZone(demand.zonas);
  const presupuesto = formatPriceEuros(demand.presupuestoMax);

  if (zona && presupuesto) {
    return `Tengo apuntado que buscas en ${zona} hasta ${presupuesto}. ¿Lo dejamos así o quieres ajustar algo antes de que te mande opciones?`;
  }

  if (zona) {
    return `Veo que te interesa la zona de ${zona}. Para enviarte opciones que encajen, ¿qué presupuesto manejas?`;
  }

  if (presupuesto) {
    return `Tengo tu presupuesto en torno a ${presupuesto}. Para empezar, ¿por qué zona quieres que mire primero?`;
  }

  return NEUTRAL_FALLBACK;
}

/**
 * Construye el digest inicial del comprador a partir de los datos reales
 * de la demanda. Usa el mismo formato compacto que `buildBuyerDigest` para
 * que el agente conversacional disponga de contexto desde el primer turno.
 */
export function buildSeedDigest(demand: DemandContextForWelcome): string {
  const parts: string[] = [];

  const range = formatPriceRange(demand.presupuestoMin, demand.presupuestoMax);
  if (range) parts.push(`Presupuesto: ${range}`);

  const zonasList = splitCsv(demand.zonas);
  if (zonasList.length > 0) parts.push(`Ubicación: ${zonasList.join(", ")}`);

  if (
    demand.habitacionesMin != null &&
    Number.isFinite(demand.habitacionesMin) &&
    demand.habitacionesMin > 0
  ) {
    parts.push(`≥${demand.habitacionesMin} hab`);
  }

  const tiposList = splitCsv(demand.tipos);
  if (tiposList.length > 0) parts.push(`Tipo: ${tiposList.join(", ")}`);

  if (parts.length === 0) {
    return "Demanda sin criterios estructurados aún";
  }

  return parts.join(" | ");
}
