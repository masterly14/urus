/**
 * Debug aislado del flujo Composio + Gmail para extraer el código 2FA de Inmovilla.
 *
 * Este script NO ejecuta Playwright ni intenta loguearse en Inmovilla.
 * Solo verifica que la integración Composio + Gmail funciona y devuelve el
 * código del último correo de `noreply1@inmovilla.com`.
 *
 * Uso (PowerShell):
 *   npx tsx scripts/debug-inmovilla-2fa.ts
 *
 * Variables requeridas en `.env`:
 *   COMPOSIO_API_KEY, COMPOSIO_USER_ID, OPENAI_API_KEY
 */

import "dotenv/config";
import { Composio } from "@composio/core";
import { OpenAIAgentsProvider } from "@composio/openai-agents";
import { Agent, run } from "@openai/agents";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[debug-2fa] Falta variable de entorno ${name}`);
    process.exit(1);
  }
  return value;
}

async function listConnectedAccounts(composio: unknown, userId: string) {
  try {
    type AccountsApi = {
      list?: (args: { userIds: string[] }) => Promise<unknown>;
    };
    const accountsApi = (composio as { connectedAccounts?: AccountsApi })
      .connectedAccounts;
    if (!accountsApi?.list) {
      console.log("[debug-2fa] connectedAccounts.list no disponible en este SDK; saltando");
      return;
    }
    const result = await accountsApi.list({ userIds: [userId] });
    console.log(
      "[debug-2fa] Cuentas conectadas (resumen):",
      JSON.stringify(result, null, 2).slice(0, 1500),
    );
  } catch (err) {
    console.warn(
      "[debug-2fa] No se pudieron listar cuentas conectadas:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function main() {
  const composioKey = requireEnv("COMPOSIO_API_KEY");
  requireEnv("OPENAI_API_KEY");
  const userId = process.env.COMPOSIO_USER_ID ?? "default";

  console.log("[debug-2fa] Configuración:");
  console.log(`  COMPOSIO_API_KEY: SET (len=${composioKey.length})`);
  console.log(`  COMPOSIO_USER_ID: ${userId}`);
  console.log(`  OPENAI_MODEL    : gpt-4o (hardcoded en helper)`);

  const composio = new Composio({
    apiKey: composioKey,
    provider: new OpenAIAgentsProvider(),
  });

  console.log("\n[debug-2fa] Listando cuentas conectadas para userId...");
  await listConnectedAccounts(composio, userId);

  console.log("\n[debug-2fa] Creando sesión Composio + tools...");
  const session = await composio.create(userId);
  const tools = await session.tools();

  console.log(`[debug-2fa] Tools disponibles: ${Array.isArray(tools) ? tools.length : "?"}`);
  if (Array.isArray(tools)) {
    const toolNames = tools
      .map((t: unknown) => {
        const obj = t as { name?: string; type?: string };
        return obj?.name ?? obj?.type ?? "unknown";
      })
      .slice(0, 30);
    console.log("[debug-2fa] Primeros nombres de tools:", toolNames);
  }

  // Probaremos dos variantes de búsqueda. La primera es la actual del helper;
  // la segunda elimina el filtro de fecha (after:YYYY/M/D) que en Gmail es por
  // día y suele ser correcto, pero queremos contrastar comportamientos.
  const sentAfter = new Date(Date.now() - 30 * 60_000);
  const queries = [
    `from:noreply1@inmovilla.com after:${sentAfter.getFullYear()}/${sentAfter.getMonth() + 1}/${sentAfter.getDate()}`,
    `from:noreply1@inmovilla.com newer_than:1d`,
    `from:@inmovilla.com newer_than:1d`,
  ];

  for (const query of queries) {
    console.log(`\n[debug-2fa] === Probando query Gmail: "${query}" ===`);

    const agent = new Agent({
      name: "Inmovilla 2FA Extractor (debug)",
      model: "gpt-4o",
      instructions: [
        "Eres una herramienta de diagnóstico que busca el último correo 2FA de Inmovilla.",
        "Reglas:",
        "- Usa la herramienta de Gmail para buscar correos con la query indicada.",
        "- Configura max_results=3 e include_payload=true.",
        "- Para CADA correo encontrado, devuelve un JSON con: subject, from, internalDate, snippet (primeros 200 chars).",
        "- Si no hay resultados, devuelve EXACTAMENTE el texto NO_RESULTS.",
        "- NO extraigas el código todavía. Solo lista lo que ves.",
        "- Devuelve un array JSON estricto, sin texto adicional.",
      ].join("\n"),
      tools,
    });

    try {
      const result = await run(
        agent,
        [
          `Search Gmail with query: '${query}'.`,
          "Use max_results=3 and include_payload=true.",
          "Return a JSON array with the last emails found (newest first).",
          "Each item must include: subject, from, internalDate, snippet (max 200 chars).",
          "If there are no results, return exactly NO_RESULTS.",
        ].join(" "),
      );

      const raw = result.finalOutput?.trim() ?? "(sin output)";
      console.log("[debug-2fa] Output crudo del agente:");
      console.log(raw.slice(0, 4000));
    } catch (err) {
      console.error(
        "[debug-2fa] Error ejecutando agente:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  console.log("\n[debug-2fa] === Reproduciendo helper getInmovilla2FACode ===");
  const sentAfterHelper = new Date(Date.now() - 10 * 60_000);
  const afterClause = ` after:${sentAfterHelper.getFullYear()}/${sentAfterHelper.getMonth() + 1}/${sentAfterHelper.getDate()}`;
  const helperAgent = new Agent({
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

  try {
    const helperResult = await run(
      helperAgent,
      [
        "Fetch the latest email from noreply1@inmovilla.com.",
        `Use query: 'from:noreply1@inmovilla.com${afterClause}'.`,
        "Set max_results to 3 and include_payload to true.",
        `Pick the most recent email. The email must have been received after ${sentAfterHelper.toISOString()}. If the most recent email is older than that, respond with 'NO_CODE_FOUND'.`,
        "Extract the numeric verification code from the email body.",
        "Return ONLY the digits, nothing else.",
      ].join(" "),
    );
    console.log("[debug-2fa] Helper output crudo:");
    console.log((helperResult.finalOutput ?? "(sin output)").slice(0, 2000));
  } catch (err) {
    console.error(
      "[debug-2fa] Error ejecutando helper-agent:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

main().catch((err) => {
  console.error("[debug-2fa] Error fatal:", err);
  process.exit(1);
});
