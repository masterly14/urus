/**
 * Test aislado del NLU contextual (classifyBuyerFeedback).
 *
 * Valida que LangGraph resuelve propiedades y clasifica sentimiento
 * a partir de texto libre + listado de propiedades mock (en memoria).
 * No toca Prisma, no crea sesiones ni selecciones, no encadena eventos.
 *
 * Para el test E2E del pipeline completo (eventos + Inmovilla + regeneración),
 * ver: scripts/test-feedback-loop-live-rpa.ts
 *
 * USO: npx tsx scripts/test-feedback-loop.ts
 *
 * Requiere: OPENAI_API_KEY en .env (usa modelo OpenAI real vía lib/agents/llm)
 */

import "dotenv/config";
import { classifyBuyerFeedback } from "../lib/agents";
import type { PropertySummaryForNLU, ConversationTurn } from "../lib/agents";

if (!process.env.OPENAI_API_KEY) {
  console.error("[test-feedback-loop] Falta OPENAI_API_KEY");
  process.exit(1);
}

const mockProperties: PropertySummaryForNLU[] = [
  {
    propertyId: "sfx-001",
    title: "Piso · Salamanca · Madrid",
    price: 485000,
    zone: "Salamanca",
    city: "Madrid",
    metersBuilt: 112,
    rooms: 3,
    extras: ["Terraza", "Ascensor", "Aire acondicionado"],
  },
  {
    propertyId: "sfx-002",
    title: "Ático · Chamartín · Madrid",
    price: 620000,
    zone: "Chamartín",
    city: "Madrid",
    metersBuilt: 95,
    rooms: 2,
    extras: ["Terraza", "Piscina", "Garaje"],
  },
  {
    propertyId: "sfx-003",
    title: "Dúplex · Chamberí · Madrid",
    price: 395000,
    zone: "Chamberí",
    city: "Madrid",
    metersBuilt: 128,
    rooms: 4,
    extras: ["Ascensor", "Chimenea"],
  },
];

type TestCase = {
  name: string;
  messageText: string;
  history: ConversationTurn[];
  expectedIntention?: string;
  expectedPropertyCount?: number;
  expectedWantsMore?: boolean;
};

const testCases: TestCase[] = [
  {
    name: "Referencia por zona: 'me gusta la de Salamanca'",
    messageText: "Me gusta la de Salamanca, esa me interesa",
    history: [],
    expectedIntention: "ME_ENCAJA",
    expectedPropertyCount: 1,
  },
  {
    name: "Rechazo por precio: 'el ático es muy caro'",
    messageText: "El ático de Chamartín es demasiado caro, quiero algo por debajo de 500.000",
    history: [],
    expectedIntention: "NO_ME_ENCAJA",
    expectedPropertyCount: 1,
  },
  {
    name: "Referencia mixta: una sí, otra no",
    messageText: "El dúplex de Chamberí me encanta pero el ático no me convence, muy pequeño",
    history: [],
    expectedPropertyCount: 2,
  },
  {
    name: "Pedir más opciones",
    messageText: "Ninguna me convence, ¿tenéis algo más?",
    history: [],
    expectedWantsMore: true,
  },
  {
    name: "Con historial previo",
    messageText: "Esa segunda también me gusta, la del garaje",
    history: [
      { role: "system", text: "[Enviado: microsite_link]", timestamp: "2026-04-02T10:00:00Z" },
      { role: "buyer", text: "Me gusta la de Salamanca", timestamp: "2026-04-02T10:05:00Z" },
    ],
    expectedPropertyCount: 1,
  },
];

async function runTest(tc: TestCase, index: number) {
  console.log(`\n--- Test ${index + 1}: ${tc.name} ---`);
  console.log(`Input: "${tc.messageText}"`);
  if (tc.history.length > 0) {
    console.log(`Historial: ${tc.history.length} turnos previos`);
  }

  const start = Date.now();
  const result = await classifyBuyerFeedback({
    messageText: tc.messageText,
    buyerPhone: "34600111222",
    demandId: "DEM-TEST-001",
    selectionProperties: mockProperties,
    conversationHistory: tc.history,
  });
  const elapsed = Date.now() - start;

  console.log(`Resultado (${elapsed}ms):`);
  console.log(`  Intention: ${result.intention} (confidence: ${result.confidence.toFixed(2)})`);
  console.log(`  PropertyFeedback: ${result.propertyFeedback.length} propiedades`);
  for (const fb of result.propertyFeedback) {
    const prop = mockProperties.find((p) => p.propertyId === fb.propertyId);
    console.log(`    - ${fb.propertyId} (${prop?.title ?? "?"}): ${fb.sentiment}`);
  }
  console.log(`  Variables: ${JSON.stringify(result.variables)}`);
  console.log(`  WantsMore: ${result.wantsMoreOptions ?? false}`);
  console.log(`  Reasoning: ${result.reasoning?.slice(0, 120) ?? "N/A"}`);

  let passed = true;

  if (tc.expectedIntention && result.intention !== tc.expectedIntention) {
    console.log(`  WARN: esperaba intention=${tc.expectedIntention}, obtuvo ${result.intention}`);
    passed = false;
  }
  if (tc.expectedPropertyCount !== undefined && result.propertyFeedback.length !== tc.expectedPropertyCount) {
    console.log(`  WARN: esperaba ${tc.expectedPropertyCount} propiedades, obtuvo ${result.propertyFeedback.length}`);
    passed = false;
  }
  if (tc.expectedWantsMore !== undefined && result.wantsMoreOptions !== tc.expectedWantsMore) {
    console.log(`  WARN: esperaba wantsMore=${tc.expectedWantsMore}, obtuvo ${result.wantsMoreOptions}`);
    passed = false;
  }

  const allIdsValid = result.propertyFeedback.every((fb) =>
    mockProperties.some((p) => p.propertyId === fb.propertyId),
  );
  if (!allIdsValid) {
    console.log("  ERROR: propertyFeedback contiene IDs que no están en el listado");
    passed = false;
  }

  console.log(`  ${passed ? "OK" : "ISSUES DETECTADOS"}`);
  return passed;
}

async function main() {
  console.log("=== Test: Feedback Loop NLU Contextual ===");
  console.log(`Propiedades mock: ${mockProperties.length}`);
  console.log(`Casos de test: ${testCases.length}`);

  let passCount = 0;

  for (let i = 0; i < testCases.length; i++) {
    const passed = await runTest(testCases[i], i);
    if (passed) passCount++;
  }

  console.log(`\n=== RESUMEN: ${passCount}/${testCases.length} tests OK ===`);

  if (passCount < testCases.length) {
    console.log("Algunos tests tienen issues (ver WARN arriba). El NLU es probabilístico — verificar manualmente.");
  }

  console.log("\n=== TEST COMPLETADO ===");
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
