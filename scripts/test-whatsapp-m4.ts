/**
 * Test M4 — Ciclo WhatsApp Cloud API completo.
 *
 * 1. Envía una plantilla (o mensaje de texto) al número de prueba +573113541077.
 * 2. Tras responder desde ese número, verificar que existe evento WHATSAPP_RECIBIDO en Neon.
 *
 * Uso:
 *   npx tsx scripts/test-whatsapp-m4.ts              # Solo envía mensaje de prueba
 *   npx tsx scripts/test-whatsapp-m4.ts --verify      # Solo verifica eventos en Neon
 *   npx tsx scripts/test-whatsapp-m4.ts --send --verify  # Envía y luego verifica
 *
 * Requiere en .env: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, DATABASE_URL (para --verify).
 * Número de prueba por defecto: +573113541077 (configurable con WHATSAPP_TEST_TO=573113541077).
 */

import "dotenv/config";
import { sendTemplateMessage, sendTextMessage } from "@/lib/whatsapp";
import { getEventsByAggregate } from "@/lib/event-store";

const TEST_TO = (process.env.WHATSAPP_TEST_TO ?? "573113541077").replace(/\D/g, "");

async function sendTestMessage(): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    console.error("Faltan WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID en .env");
    process.exit(1);
  }

  // Intentar plantilla hello_world (habitual en cuentas de desarrollo). Si no existe, usar texto.
  const useTemplate = process.env.WHATSAPP_TEST_USE_TEMPLATE !== "false";
  if (useTemplate) {
    try {
      await sendTemplateMessage(TEST_TO, {
        name: "hello_world",
        language: { code: "en_US" },
      });
      console.log(`[OK] Plantilla hello_world enviada a +${TEST_TO}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("template") || msg.includes("100") || msg.includes("131047")) {
        console.warn("Plantilla no disponible, enviando mensaje de texto de prueba.");
        await sendTextMessage(TEST_TO, "Test M4 — Urus Capital. Responde para verificar webhook.");
        console.log(`[OK] Mensaje de texto enviado a +${TEST_TO}`);
      } else {
        throw e;
      }
    }
  } else {
    await sendTextMessage(TEST_TO, "Test M4 — Urus Capital. Responde para verificar webhook.");
    console.log(`[OK] Mensaje de texto enviado a +${TEST_TO}`);
  }

  console.log("\nResponde desde +" + TEST_TO + " para que el webhook emita WHATSAPP_RECIBIDO en Neon.");
  console.log("Luego ejecuta: npx tsx scripts/test-whatsapp-m4.ts --verify");
}

async function verifyEventsInNeon(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL requerida para --verify");
    process.exit(1);
  }

  const events = await getEventsByAggregate("WHATSAPP_CONVERSATION", TEST_TO, { limit: 20 });
  const recibidos = events.filter((e) => e.type === "WHATSAPP_RECIBIDO");

  console.log(`Eventos para aggregateId=${TEST_TO} (WHATSAPP_CONVERSATION): ${events.length}`);
  console.log(`  WHATSAPP_RECIBIDO: ${recibidos.length}`);
  if (recibidos.length === 0) {
    console.log("\nNo hay eventos WHATSAPP_RECIBIDO aún. Responde desde +" + TEST_TO + " y vuelve a ejecutar --verify.");
    process.exit(1);
  }
  console.log("\n[OK] Ciclo WA verificado: al menos un mensaje recibido persistido en Neon.");
  recibidos.slice(0, 3).forEach((e, i) => {
    console.log(`  ${i + 1}. position=${e.position} type=${e.type} at ${e.createdAt.toISOString()}`);
  });
}

async function main(): Promise<void> {
  const doSend = process.argv.includes("--send") || (!process.argv.includes("--verify") && process.argv.length <= 2);
  const doVerify = process.argv.includes("--verify");

  if (doSend) await sendTestMessage();
  if (doVerify) await verifyEventsInNeon();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
