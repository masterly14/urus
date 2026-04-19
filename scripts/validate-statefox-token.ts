/**
 * Valida STATEFOX_BEARER_TOKEN con una petición mínima a GET /snapshot.
 *
 * Uso: npx tsx scripts/validate-statefox-token.ts
 * Requiere: STATEFOX_BEARER_TOKEN en .env (opcional: STATEFOX_REST_TIMEOUT_MS)
 */

import "dotenv/config";
import { createStatefoxClient, getSnapshot } from "../lib/statefox/client";

function maskToken(token: string): string {
  if (token.length <= 8) return "(demasiado corto para enmascarar)";
  return `${token.slice(0, 4)}…${token.slice(-4)} (${token.length} caracteres)`;
}

async function main(): Promise<void> {
  console.log("\n[statefox] Validación de token\n");

  const token = process.env.STATEFOX_BEARER_TOKEN?.trim();
  if (!token) {
    console.error("[statefox] ERROR: No hay STATEFOX_BEARER_TOKEN en el entorno (.env).");
    console.error("[statefox] Define el token y vuelve a ejecutar el script.\n");
    process.exit(1);
  }

  console.log(`[statefox] Token detectado: ${maskToken(token)}`);
  console.log(
    "[statefox] Base URL: https://statefox.com/public/aapi/props (misma que lib/statefox/client.ts)",
  );
  console.log("[statefox] Petición: GET /snapshot?items=1 (mínima para comprobar auth)\n");

  try {
    const client = createStatefoxClient({ token });
    const data = await getSnapshot(client, { items: 1 });

    const result = data.result ?? {};
    const n = Object.keys(result).length;
    const meta = data.meta ?? {} as Record<string, unknown>;

    console.log("[statefox] OK — La API respondió correctamente (el token es válido).");
    console.log(`[statefox] Propiedades en esta página: ${n}`);
    console.log(
      `[statefox] meta: total=${String((meta as Record<string, unknown>).total ?? "?")}, next=${meta.next != null ? "presente" : "null"}\n`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[statefox] FALLO — No se pudo completar la petición.");
    console.error(`[statefox] Detalle: ${msg}`);
    console.error(
      "\n[statefox] Si ves 401/403, el token es inválido o revocado. Si ves timeout, revisa red o STATEFOX_REST_TIMEOUT_MS.\n",
    );
    process.exit(1);
  }
}

main();
