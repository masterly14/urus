/**
 * Configuración central del modelo OpenAI para los agentes LangGraph.
 * Todos los grafos del sistema importan el modelo desde aquí para garantizar
 * consistencia de parámetros (modelo, temperatura, timeout).
 *
 * La validación de OPENAI_API_KEY es lazy: se comprueba en el primer acceso
 * a una instancia, no al importar el módulo. Esto evita que rutas que
 * importan transitivamente pero no llaman al LLM fallen al arrancar.
 */
import { ChatOpenAI } from "@langchain/openai";

function requireApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY no está definida en las variables de entorno");
  }
  return key;
}

function lazyLLM<T extends ChatOpenAI>(factory: () => T): T {
  let instance: T | null = null;
  return new Proxy({} as T, {
    get(_target, prop, receiver) {
      if (!instance) instance = factory();
      const value = Reflect.get(instance, prop, receiver);
      return typeof value === "function" ? value.bind(instance) : value;
    },
  });
}

/**
 * Modelo principal para clasificación y extracción estructurada (NLU).
 * Temperatura 0 para máxima determinismo en extracción de entidades.
 */
export const llm: ChatOpenAI = lazyLLM(
  () =>
    new ChatOpenAI({
      model: "gpt-5.4-mini",
      temperature: 0,
      apiKey: requireApiKey(),
      timeout: 30_000,
    }),
);

/**
 * Modelo con soporte nativo de structured output (tool_choice: required).
 * Se usa en nodos que requieren JSON garantizado (extracción de demanda).
 */
export const llmWithStructuredOutput = llm;

/**
 * M12 — Bot de Soporte Mental: clasificador de estado emocional.
 * Temperatura 0 para clasificación determinista con structured output.
 */
export const llmMentalHealthClassifier: ChatOpenAI = lazyLLM(
  () =>
    new ChatOpenAI({
      model: "gpt-5.4-mini",
      temperature: 0,
      apiKey: requireApiKey(),
      timeout: 30_000,
    }),
);

/**
 * M12 — Bot de Soporte Mental: generador de respuestas conversacionales.
 * Temperatura 0.7 para respuestas naturales y variadas.
 */
export const llmMentalHealth: ChatOpenAI = lazyLLM(
  () =>
    new ChatOpenAI({
      model: "gpt-5.4-mini",
      temperature: 0.7,
      apiKey: requireApiKey(),
      timeout: 45_000,
    }),
);

/**
 * M12 — Desarrollo Continuo: generador de micro-ejercicios y retos semanales.
 * Temperatura 0.8 para variedad en ejercicios (evitar repetición entre días).
 */
export const llmDevExercise: ChatOpenAI = lazyLLM(
  () =>
    new ChatOpenAI({
      model: "gpt-5.4-mini",
      temperature: 0.8,
      apiKey: requireApiKey(),
      timeout: 30_000,
    }),
);
