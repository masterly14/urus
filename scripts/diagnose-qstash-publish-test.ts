/**
 * diagnose-qstash-publish-test.ts
 *
 * Verifica que publicar en QStash al endpoint /api/parte-visita/send funciona
 * AHORA. Publica un schedule con `notBefore` muy lejano en el futuro (1 año)
 * y un body con sessionId inexistente — de modo que aunque QStash dispare en
 * algún momento, el endpoint responderá 200 (sessión no encontrada = permanent
 * error pero no daña nada). Luego BORRA el schedule inmediatamente para no
 * dejar basura.
 *
 * Sirve para descartar:
 *   - QSTASH_TOKEN inválido / caducado.
 *   - NEXT_PUBLIC_APP_URL mal configurada en el entorno actual.
 *   - Errores de red / rate-limit en este momento.
 */

import "dotenv/config";
import { publishParteVisitaSendSchedule } from "../lib/parte-visita/schedule";
import { getPublicAppUrl } from "../lib/microsite/app-url";

async function main() {
  console.log("Public app URL :", getPublicAppUrl());
  console.log("QSTASH_TOKEN   :", process.env.QSTASH_TOKEN ? "<set>" : "<MISSING>");

  const futureDate = new Date(Date.now() + 365 * 24 * 3600_000);
  console.log("\nIntentando publicar con notBefore =", futureDate.toISOString(), "...");

  try {
    const { messageId, sendAtIso } = await publishParteVisitaSendSchedule({
      parteVisitaSessionId: "DIAGNOSTIC_PROBE_DELETE_ME",
      visitDateTime: futureDate,
    });
    console.log("\nOK — publish funcionó.");
    console.log(`  messageId  = ${messageId}`);
    console.log(`  sendAtIso  = ${sendAtIso}`);

    if (messageId) {
      console.log("\nBorrando el mensaje para no dejar basura...");
      const token = process.env.QSTASH_TOKEN?.trim();
      const res = await fetch(
        `https://qstash.upstash.io/v2/messages/${messageId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      console.log(`  DELETE response: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    console.log("\nFALLO — publish lanzó error:");
    console.log(err);
  }
}

main().catch((err) => {
  console.error("[diagnose-qstash-publish-test] ERROR:", err);
  process.exit(99);
});
