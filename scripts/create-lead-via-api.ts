import "dotenv/config";

/**
 * Script de prueba: crear un "lead" (cliente + demanda) usando la API REST de Inmovilla
 *
 * Flujo:
 * 1. Crear cliente vía API REST (lib/inmovilla/rest: createClient)
 * 2. Verificar con getClient
 * 3. Crear demanda vía legacy writeToInmovilla (porque no hay endpoint REST para demandas)
 *
 * Variables de entorno requeridas:
 * - INMOVILLA_API_TOKEN: token generado desde Ajustes > Opciones > Token para API Rest
 * - INMOVILLA_AGENT_ID: ID del agente que captará el lead
 * - Variables legacy para demandas (USER, PASSWORD, OFFICE_KEY) si se quiere crear la demanda
 */

import {
  createInmovillaRestClient,
  createClient,
  getClient,
} from "@/lib/inmovilla/rest";
import type { CreateClientPayload } from "@/lib/inmovilla/rest";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variable de entorno ${name} no configurada`);
  }
  return value;
}

async function main() {
  requireEnv("INMOVILLA_API_TOKEN");
  const client = createInmovillaRestClient();

  const testClient: CreateClientPayload = {
    nombre: process.env.TEST_CLIENT_NOMBRE || "Test Lead",
    apellidos: process.env.TEST_CLIENT_APELLIDOS || "API REST",
    email:
      process.env.TEST_CLIENT_EMAIL ||
      `test-lead-${Date.now()}@urus.capital`,
    telefono2:
      Number(process.env.TEST_CLIENT_TELEFONO) ||
      600000000 + Math.floor(Math.random() * 100000),
    prefijotel2: 34,
    nonewsletters: 0,
    gesauto: 2,
    rgpdwhats: 2,
    enviosauto: true,
    observacion: `Lead de prueba creado vía API REST - ${new Date().toISOString()}`,
  };

  console.log("=".repeat(60));
  console.log("CREACIÓN DE LEAD VÍA API REST DE INMOVILLA");
  console.log("=".repeat(60));
  console.log("");

  console.log("[REST API] Creando cliente...");
  console.log("  Nombre:", testClient.nombre, testClient.apellidos);
  console.log("  Email:", testClient.email);
  console.log("  Teléfono:", testClient.telefono2 || testClient.telefono1 || "N/A");

  const result = await createClient(client, testClient);

  console.log("[REST API] Cliente creado exitosamente:");
  console.log("  cod_cli:", result.cod_cli);
  console.log("  mensaje:", result.mensaje);
  console.log("");

  console.log("[REST API] Verificando cliente creado...");
  const cliente = await getClient(client, result.cod_cli);
  console.log("[REST API] Cliente verificado:");
  console.log("  cod_cli:", cliente.cod_cli);
  console.log("  nombre:", cliente.nombre, cliente.apellidos);
  console.log("  email:", cliente.email);
  console.log("  telefono1:", cliente.telefono1);
  console.log("  telefono2:", cliente.telefono2);
  console.log("");

  console.log("=".repeat(60));
  console.log("SIGUIENTE PASO MANUAL:");
  console.log("=".repeat(60));
  console.log("");
  console.log("1. Abre Inmovilla en el navegador:");
  console.log("   https://crm.inmovilla.com/panel/");
  console.log("");
  console.log("2. Ve a la sección 'Contactos' (icono de persona)");
  console.log("");
  console.log(`3. Busca el cliente con cod_cli: ${result.cod_cli}`);
  console.log(`   o por email: ${testClient.email}`);
  console.log("");
  console.log("4. Verifica que aparece en la lista de contactos.");
  console.log("");
  console.log("NOTA: Este cliente NO tiene demanda asociada todavía.");
  console.log("      Para crear la demanda, usa el flujo legacy:");
  console.log(`      npm run egestion:write createDemand -- --clientId=${result.cod_cli}`);
  console.log("");
  console.log("=".repeat(60));
}

main().catch((error: unknown) => {
  console.error("\n❌ Error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
