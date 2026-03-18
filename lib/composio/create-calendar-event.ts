import { Composio } from "@composio/core";
import { OpenAIAgentsProvider } from "@composio/openai-agents";
import { Agent, run } from "@openai/agents";

export interface CalendarEventInput {
  titulo: string;
  descripcion: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  ubicacion?: string;
}

export interface CalendarEventResult {
  success: boolean;
  eventId?: string;
  link?: string;
  raw: string;
}

/**
 * Crea un evento en Google Calendar del comercial usando Composio.
 *
 * Sigue el mismo patrón de instanciación que get-inmovilla-2fa-code.ts:
 * Composio + OpenAIAgentsProvider + Agent de @openai/agents.
 *
 * Requiere en .env:
 *   COMPOSIO_API_KEY  – API key de Composio
 *   COMPOSIO_USER_ID  – User ID con conexión Google Calendar activa
 *   OPENAI_API_KEY    – API key de OpenAI
 */
export async function createCalendarEvent(
  input: CalendarEventInput,
): Promise<CalendarEventResult> {
  const composio = new Composio({
    apiKey: process.env.COMPOSIO_API_KEY,
    provider: new OpenAIAgentsProvider(),
  });

  const userId = process.env.COMPOSIO_USER_ID ?? "default";

  const session = await composio.create(userId);
  const tools = await session.tools();

  const startDateTime = `${input.fecha}T${input.horaInicio}:00`;
  const endDateTime = `${input.fecha}T${input.horaFin}:00`;

  const agent = new Agent({
    name: "Google Calendar Event Creator",
    model: "gpt-4o",
    instructions: [
      "Eres una herramienta que crea eventos en Google Calendar.",
      "Reglas estrictas:",
      "- Crea un evento de calendario con los datos proporcionados.",
      "- Usa la zona horaria Europe/Madrid.",
      "- Si la creación es exitosa, responde con un JSON: {\"success\":true,\"eventId\":\"<id>\",\"link\":\"<htmlLink>\"}",
      "- Si falla, responde con: {\"success\":false,\"error\":\"<motivo>\"}",
      "- NO devuelvas ningún otro texto fuera del JSON.",
    ].join("\n"),
    tools,
  });

  const prompt = [
    `Create a Google Calendar event with the following details:`,
    `- Title: ${input.titulo}`,
    `- Description: ${input.descripcion}`,
    `- Start: ${startDateTime} (timezone: Europe/Madrid)`,
    `- End: ${endDateTime} (timezone: Europe/Madrid)`,
    input.ubicacion ? `- Location: ${input.ubicacion}` : "",
    `Return ONLY a JSON object with success, eventId, and link fields.`,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await run(agent, prompt);
  const raw = result.finalOutput?.trim() ?? "";

  try {
    const parsed = JSON.parse(raw);
    return { ...parsed, raw };
  } catch {
    return { success: false, raw };
  }
}
