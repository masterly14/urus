/**
 * Configuración central del modelo OpenAI para los agentes LangGraph.
 * Todos los grafos del sistema importan el modelo desde aquí para garantizar
 * consistencia de parámetros (modelo, temperatura, timeout).
 */
import { ChatOpenAI } from "@langchain/openai";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY no está definida en las variables de entorno");
}

/**
 * Modelo principal para clasificación y extracción estructurada (NLU).
 * Temperatura 0 para máxima determinismo en extracción de entidades.
 */
export const llm = new ChatOpenAI({
  model: "gpt-4o-mini",
  temperature: 0,
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30_000,
});

/**
 * Modelo con soporte nativo de structured output (tool_choice: required).
 * Se usa en nodos que requieren JSON garantizado (extracción de demanda).
 */
export const llmWithStructuredOutput = llm;

/**
 * M12 — Bot de Soporte Mental: clasificador de estado emocional.
 * Temperatura 0 para clasificación determinista con structured output.
 */
export const llmMentalHealthClassifier = new ChatOpenAI({
  model: "gpt-5.4-mini",
  temperature: 0,
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30_000,
});

/**
 * M12 — Bot de Soporte Mental: generador de respuestas conversacionales.
 * Temperatura 0.7 para respuestas naturales y variadas.
 */
export const llmMentalHealth = new ChatOpenAI({
  model: "gpt-5.4-mini",
  temperature: 0.7,
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 45_000,
});

/**
 * M12 — Desarrollo Continuo: generador de micro-ejercicios y retos semanales.
 * Temperatura 0.8 para variedad en ejercicios (evitar repetición entre días).
 */
export const llmDevExercise = new ChatOpenAI({
  model: "gpt-5.4-mini",
  temperature: 0.8,
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30_000,
});
