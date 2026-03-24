/**
 * Script de validación del agente de clasificación de respuestas WhatsApp.
 * Invoca la implementación oficial en lib/agents (classifyWhatsAppResponse)
 * con varios mensajes de ejemplo para comprobar que LangGraph + OpenAI responden.
 *
 * El agente en sí está en lib/agents/nlu-graph.ts; este script solo lo llama.
 * Uso: npm run agents:test-langgraph
 */

import "dotenv/config";
import { classifyWhatsAppResponse } from "@/lib/agents";

const CASOS_PRUEBA = [
  {
    label: "ME_ENCAJA — interés positivo",
    mensaje: "Me parece bien, me interesa verla. ¿Cuándo podemos quedar para una visita?",
  },
  {
    label: "NO_ME_ENCAJA — pide más metros y precio más bajo",
    mensaje: "No me convence, el precio es demasiado alto para el tamaño. Busco algo de 90m² por menos de 250.000€ en la misma zona.",
  },
  {
    label: "BUSCO_DIFERENTE — cambio de tipología",
    mensaje: "En realidad he pensado que prefiero una casa con jardín en las afueras, el piso no me atrae.",
  },
];

async function main() {
  console.log("=== Test LangGraph — Agente NLU M5 ===\n");

  for (const caso of CASOS_PRUEBA) {
    console.log(`--- ${caso.label} ---`);
    console.log(`Mensaje: "${caso.mensaje}"`);

    try {
      const result = await classifyWhatsAppResponse({
        messageText: caso.mensaje,
        buyerPhone: "34600000000",
        demandId: "test-demand-001",
      });

      console.log(`✓ Intención:   ${result.intention}`);
      console.log(`✓ Confianza:   ${(result.confidence * 100).toFixed(0)}%`);
      if (Object.keys(result.variables).length > 0) {
        console.log(`✓ Variables:   ${JSON.stringify(result.variables)}`);
      }
      console.log(`✓ Razonamiento: ${result.reasoning}`);
    } catch (err) {
      console.error(`✗ Error:`, err);
    }

    console.log();
  }

  console.log("=== LangGraph operativo ===");
}

main().catch(console.error);
