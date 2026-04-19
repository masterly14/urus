import type { EvalScenario } from "../types";
import { PERSONA_COLOQUIAL, PERSONA_INDECISO, PERSONA_EMOCIONAL } from "../personas";
import { MOCK_PROPERTIES } from "./mock-properties";

export const AMBIGUITY_SCENARIOS: EvalScenario[] = [
  {
    id: "am-001",
    name: "Texto muy ambiguo con referencia vaga",
    category: "ambiguity_handling",
    properties: MOCK_PROPERTIES,
    conversationHistory: [],
    persona: PERSONA_INDECISO,
    buyerInstructions: "Te gusta vagamente 'algo céntrico' pero no sabes cuál. No nombres ninguna propiedad específica, sé lo más ambiguo posible.",
    expectedOutcome: {
      intention: "NO_ME_ENCAJA",
    },
  },
  {
    id: "am-002",
    name: "Errores tipográficos y abreviaturas",
    category: "ambiguity_handling",
    properties: MOCK_PROPERTIES,
    conversationHistory: [],
    persona: PERSONA_COLOQUIAL,
    buyerInstructions: "Te gusta el ático (eval-002) pero escribe con errores tipográficos y abreviaturas: 'atico', 'chamrtin', 'sta bien', 'piscna'. Simula escritura rápida en móvil.",
    expectedOutcome: {
      propertyFeedback: [{ propertyId: "eval-002", sentiment: "ME_INTERESA" }],
    },
  },
  {
    id: "am-003",
    name: "Mezcla castellano e inglés",
    category: "ambiguity_handling",
    properties: MOCK_PROPERTIES,
    conversationHistory: [],
    persona: PERSONA_EMOCIONAL,
    buyerInstructions: "Te encanta la casa de Pozuelo (eval-005) pero mezcla español e inglés: 'amazing', 'love it', 'super nice'. El estudio (eval-004) es 'too small, no way'.",
    expectedOutcome: {
      propertyFeedback: [
        { propertyId: "eval-005", sentiment: "ME_INTERESA" },
        { propertyId: "eval-004", sentiment: "NO_ME_ENCAJA" },
      ],
    },
  },
  {
    id: "am-004",
    name: "Referencia ambigua: dos propiedades con piscina",
    category: "ambiguity_handling",
    properties: MOCK_PROPERTIES,
    conversationHistory: [],
    persona: PERSONA_COLOQUIAL,
    buyerInstructions: "Te gusta 'la de la piscina'. Tanto eval-002 (ático) como eval-005 (casa) tienen piscina. Refiérete solo a 'la de la piscina' sin dar más pistas. El NLU deberá resolver cuál(es).",
    expectedOutcome: {
      propertyFeedback: [
        { propertyId: "eval-002", sentiment: "ME_INTERESA" },
        { propertyId: "eval-005", sentiment: "ME_INTERESA" },
      ],
    },
  },
];
