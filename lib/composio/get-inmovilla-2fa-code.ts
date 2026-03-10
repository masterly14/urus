import { Composio } from "@composio/core";
import { OpenAIAgentsProvider } from "@composio/openai-agents";
import { Agent, run } from "@openai/agents";

/**
 * Busca el último correo de Inmovilla en Gmail y extrae el código 2FA
 * usando un LLM (OpenAI) para analizar el contenido del email.
 *
 * Requiere en .env:
 *   COMPOSIO_API_KEY   – API key de Composio (https://app.composio.dev)
 *   COMPOSIO_ENTITY_ID – ID de entidad en Composio con conexión Gmail activa
 *   OPENAI_API_KEY     – API key de OpenAI
 */

export async function getInmovilla2FACode(): Promise<string> {
  const composio = new Composio({
    apiKey: process.env.COMPOSIO_API_KEY,
    provider: new OpenAIAgentsProvider(),
  });

  const entityId = process.env.COMPOSIO_ENTITY_ID ?? "default";

  const tools = await composio.tools.get(entityId, {
    tools: ["GMAIL_FETCH_EMAILS"],
  });

  const agent = new Agent({
    name: "Inmovilla 2FA Extractor",
    instructions: [
      "Eres una herramienta que extrae códigos de verificación 2FA de correos de Inmovilla.",
      "Reglas estrictas:",
      "- Busca el email más reciente de 'noreply1@inmovilla.com'.",
      "- Lee el contenido completo del email.",
      "- Extrae el código de verificación numérico (normalmente 6 dígitos).",
      "- Devuelve ÚNICAMENTE el código como string de dígitos (ej: '908047').",
      "- NO devuelvas ningún otro texto, explicación, formato ni comillas. Solo los dígitos.",
    ].join("\n"),
    tools,
  });

  
  const result = await run(
    agent,
    [
      "Fetch the latest email from noreply1@inmovilla.com.",
      "Use query: 'from:noreply1@inmovilla.com'.",
      "Set max_results to 1 and include_payload to true.",
      "Extract the numeric verification code from the email body.",
      "Return ONLY the digits, nothing else.",
    ].join(" "),
  );

  const raw = result.finalOutput?.trim() ?? "";
  const match = raw.match(/\d{4,8}/);

  if (!match) {
    throw new Error(
      `No se pudo extraer el código 2FA de Inmovilla. Respuesta del agente: "${raw}"`,
    );
  }

  return match[0];
}
