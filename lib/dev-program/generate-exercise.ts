/**
 * M12 — Programas de Desarrollo Continuo: generación de ejercicios por IA.
 *
 * Un LLM genera micro-ejercicios diarios y retos semanales personalizados
 * usando el tema de la semana + contexto CRM del comercial.
 */

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { llmDevExercise } from "@/lib/agents/llm";
import type { DevTheme, DevExerciseCrmContext } from "./types";

export interface GenerateExerciseInput {
  theme: DevTheme;
  type: "DAILY" | "WEEKLY_CHALLENGE";
  dayOfWeek: number;
  weekNumber: number;
  crmContext: DevExerciseCrmContext | null;
}

const DAY_NAMES: Record<number, string> = {
  1: "lunes",
  2: "martes",
  3: "miércoles",
  4: "jueves",
  5: "viernes",
};

function buildSystemPrompt(input: GenerateExerciseInput): string {
  const { theme, type, dayOfWeek, crmContext } = input;

  const dayName = DAY_NAMES[dayOfWeek] ?? "hoy";
  const isWeekly = type === "WEEKLY_CHALLENGE";

  const parts: string[] = [
    `Eres un coach de alto rendimiento para comerciales inmobiliarios en España (Córdoba, Málaga, Sevilla). No eres motivacional ni cursi. Eres directo, concreto, operativo.`,
    ``,
    `CÓMO ESCRIBES:`,
    `- Español de España natural. Tutea. Nada de "estimado" ni fórmulas corporativas.`,
    `- Frases cortas. Sin párrafos interminables. Vas al grano.`,
    `- NUNCA uses emojis. NUNCA uses exclamaciones tipo "¡Genial!" o "¡Tú puedes!".`,
    `- No uses listas numeradas largas. Máximo 2-3 puntos si es imprescindible.`,
    `- El ejercicio tiene que caber en un mensaje de WhatsApp (máximo 300 palabras).`,
    `- Habla como un colega veterano que lleva 10 años cerrando pisos, no como un libro de autoayuda.`,
    ``,
    `TEMA DE LA SEMANA: ${theme.label.toUpperCase()}`,
    `${theme.description}`,
    ``,
  ];

  if (isWeekly) {
    parts.push(
      `TIPO: RETO SEMANAL`,
      `Genera un reto que el comercial pueda practicar toda la semana. Algo medible y concreto.`,
      `Estructura:`,
      `- Abre con una frase directa que enganche (sin "Buenos días").`,
      `- Describe el reto en 2-3 frases: qué hacer, cuándo, cómo medir si lo cumplió.`,
      `- Cierra con una frase que ancle el propósito del reto sin ser cursi.`,
      ``,
      `Ejemplo de tono: "Esta semana, antes de cada llamada con un comprador, di el precio en voz alta 3 veces. Solo. Sin pensar si es caro. Si te cuesta, mejor: ahí está el músculo que vas a entrenar."`,
    );
  } else {
    parts.push(
      `TIPO: MICRO-EJERCICIO DIARIO (${dayName})`,
      `Genera un ejercicio de 2-5 minutos para hacer AHORA, antes de arrancar la jornada.`,
      `Estructura:`,
      `- Abre con una frase directa que enganche (sin "Buenos días").`,
      `- Describe el ejercicio en 2-3 frases: qué hacer exactamente, cuánto tiempo.`,
      `- Cierra con el resultado esperado: "Cuando termines, X."`,
      ``,
      `Ejemplo de tono: "Antes de tu primera llamada, escribe en un post-it la cifra más alta que vas a decir hoy. Ponlo donde lo veas. Cada vez que lo mires, tu cerebro se acostumbra un poco más a ese número."`,
    );

    if (dayOfWeek === 1) {
      parts.push(
        `Es lunes: arranca la semana con energía. El ejercicio debe activar, no reflexionar.`,
      );
    } else if (dayOfWeek === 5) {
      parts.push(
        `Es viernes: el ejercicio puede incluir una mini-reflexión sobre la semana, pero sin ser denso. Cierra con algo concreto para la próxima semana.`,
      );
    }
  }

  if (crmContext) {
    parts.push(
      ``,
      `CONTEXTO DEL COMERCIAL (úsalo de forma natural, NUNCA digas "según tus datos"):`,
      `- Nombre: ${crmContext.nombreComercial}`,
      `- Ciudad: ${crmContext.ciudad}`,
    );
    if (crmContext.operacionPerdidaReciente) {
      parts.push(
        `- Perdió una operación recientemente. Si encaja con el tema de hoy, referéncialo con tacto.`,
      );
    }
    if (crmContext.rachaPositiva) {
      parts.push(
        `- Está en buena racha (varios cierres recientes). Puedes usarlo como ancla de confianza.`,
      );
    }
    if (crmContext.cierresPendientesHoy > 0) {
      parts.push(
        `- Tiene ${crmContext.cierresPendientesHoy} cierre(s) pendiente(s) hoy. El ejercicio puede orientarse a preparar ese momento.`,
      );
    }
  }

  parts.push(
    ``,
    `REGLAS INQUEBRANTABLES:`,
    `- NO repitas ejercicios genéricos tipo "respira hondo" o "piensa en positivo".`,
    `- Cada ejercicio debe ser ESPECÍFICO para el mundo inmobiliario (precios, compradores, objeciones, visitas, cierres).`,
    `- Varía los ejercicios: no siempre "escribe algo", mezcla con ejercicios verbales, de visualización, de rol, de análisis de operaciones reales.`,
    `- El comercial debe poder hacerlo solo, sin herramientas especiales, en 2-5 minutos.`,
  );

  return parts.join("\n");
}

const FALLBACK_EXERCISES: Record<string, string> = {
  DAILY:
    "Antes de tu primera llamada del día, coge un post-it y escribe el precio " +
    "más alto que vas a manejar hoy. Ponlo donde lo veas. Cada vez que lo mires, " +
    "tu cabeza se acostumbra un poco más a decir esa cifra con naturalidad. " +
    "Cuando termines la jornada, revisa si lo dijiste con la misma soltura que " +
    "un «buenos días».",
  WEEKLY_CHALLENGE:
    "Esta semana, después de cada visita, apunta en una línea qué objeción " +
    "recibiste y cómo la manejaste. El viernes revisa la lista: si la misma " +
    "objeción aparece más de dos veces, prepara una respuesta definitiva para " +
    "la semana que viene.",
};

export async function generateExercise(
  input: GenerateExerciseInput,
): Promise<string> {
  const systemPrompt = buildSystemPrompt(input);

  const typeLabel =
    input.type === "WEEKLY_CHALLENGE"
      ? `un reto semanal sobre "${input.theme.label}"`
      : `un micro-ejercicio diario sobre "${input.theme.label}" para el ${DAY_NAMES[input.dayOfWeek] ?? "día"}`;

  try {
    const response = await llmDevExercise.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(`Genera ${typeLabel}. Semana ${input.weekNumber + 1} del programa.`),
    ]);

    const content =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

    return content.trim();
  } catch (err) {
    console.error(
      `[dev-program/generate-exercise] LLM falló, usando fallback: ${err instanceof Error ? err.message : String(err)}`,
    );
    return FALLBACK_EXERCISES[input.type] ?? FALLBACK_EXERCISES.DAILY;
  }
}
