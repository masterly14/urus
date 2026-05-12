import { Composio } from "@composio/core";
import { OpenAIAgentsProvider } from "@composio/openai-agents";
import { Agent, run } from "@openai/agents";
import {
  ComposioGmailNotConnectedError,
  getActiveGmailConnection,
} from "./gmail-connection";

/**
 * Busca el correo 2FA de Inmovilla más reciente en Gmail (vía Composio) y
 * extrae el código de verificación.
 *
 * Antes de llamar al agente LLM se valida que la conexión Gmail en Composio
 * esté `ACTIVE` para `COMPOSIO_USER_ID`. Si no, se lanza
 * `ComposioGmailNotConnectedError` para que el caller pueda alertar y abortar
 * sin gastar tokens ni reintentos.
 *
 * Variables requeridas en `.env`:
 *   COMPOSIO_API_KEY                       – API key de Composio (https://app.composio.dev)
 *   COMPOSIO_USER_ID                       – User ID en Composio con conexión Gmail activa
 *   COMPOSIO_GMAIL_CONNECTED_ACCOUNT_ID    – (opcional pero recomendado) ID `ca_…` de la
 *                                            conexión Gmail anclada para producción
 *   OPENAI_API_KEY                         – API key de OpenAI
 *
 * @param sentAfter Solo considerar correos recibidos después de esta fecha.
 */
export async function getInmovilla2FACode(sentAfter?: Date): Promise<string> {
  const composio = new Composio({
    apiKey: process.env.COMPOSIO_API_KEY,
    provider: new OpenAIAgentsProvider(),
  });

  const userId = process.env.COMPOSIO_USER_ID ?? "default";

  const gmailConnection = await getActiveGmailConnection(composio, userId);
  console.log(
    `[2fa] Composio Gmail OK (userId=${userId}, connectedAccountId=${gmailConnection.id}, status=${gmailConnection.status})`,
  );

  const session = await composio.create(userId);
  const tools = await session.tools();

  const afterClause = sentAfter
    ? ` after:${sentAfter.getFullYear()}/${sentAfter.getMonth() + 1}/${sentAfter.getDate()}`
    : "";
  const timeHint = sentAfter
    ? ` The email must have been received after ${sentAfter.toISOString()}. If the most recent email is older than that, respond with 'NO_CODE_FOUND'.`
    : "";

  const agent = new Agent({
    name: "Inmovilla 2FA Extractor",
    model: "gpt-4o",
    instructions: [
      "Eres una herramienta que extrae códigos de verificación 2FA de correos de Inmovilla.",
      "Reglas estrictas:",
      "- Busca el email más reciente de 'noreply1@inmovilla.com'.",
      "- Lee el contenido completo del email.",
      "- Extrae el código de verificación numérico (normalmente 6 dígitos).",
      "- Devuelve ÚNICAMENTE el código como string de dígitos (ej: '908047').",
      "- NO devuelvas ningún otro texto, explicación, formato ni comillas. Solo los dígitos.",
      "- Si el correo es demasiado antiguo o no contiene código, responde 'NO_CODE_FOUND'.",
    ].join("\n"),
    tools,
  });

  const result = await run(
    agent,
    [
      "Fetch the latest email from noreply1@inmovilla.com.",
      `Use query: 'from:noreply1@inmovilla.com${afterClause}'.`,
      "Set max_results to 3 and include_payload to true.",
      `Pick the most recent email.${timeHint}`,
      "Extract the numeric verification code from the email body.",
      "Return ONLY the digits, nothing else.",
    ].join(" "),
  );

  const raw = result.finalOutput?.trim() ?? "";

  if (/connect\.composio\.dev\/link/i.test(raw)) {
    throw new ComposioGmailNotConnectedError(
      "Composio: el agente devolvió un enlace de autorización Gmail (la conexión no está realmente ACTIVA). Reautoriza en https://app.composio.dev.",
      { userId, expectedConnectionId: gmailConnection.id, observedStatus: "INITIALIZING" },
    );
  }

  if (raw.includes("NO_CODE_FOUND")) {
    throw new Error("No se encontró un correo 2FA reciente de Inmovilla");
  }

  const match = raw.match(/\d{4,8}/);

  if (!match) {
    const preview = raw.slice(0, 200);
    throw new Error(
      `No se pudo extraer el código 2FA de Inmovilla. Respuesta del agente (primeros 200 chars): "${preview}"`,
    );
  }

  return match[0];
}
