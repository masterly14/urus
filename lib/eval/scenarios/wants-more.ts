import type { EvalScenario } from "../types";
import { PERSONA_CORTADOR, PERSONA_DIRECTO, PERSONA_COLOQUIAL, PERSONA_EXIGENTE } from "../personas";
import { MOCK_PROPERTIES } from "./mock-properties";

export const WANTS_MORE_SCENARIOS: EvalScenario[] = [
  {
    id: "wm-001",
    name: "Pide más opciones explícitamente",
    category: "wants_more_detection",
    properties: MOCK_PROPERTIES,
    conversationHistory: [],
    persona: PERSONA_CORTADOR,
    buyerInstructions: "Ninguna te convence. Pide explícitamente que te enseñen más propiedades, otras opciones.",
    expectedOutcome: {
      wantsMoreOptions: true,
      intention: "NO_ME_ENCAJA",
    },
  },
  {
    id: "wm-002",
    name: "Pide más opciones implícitamente",
    category: "wants_more_detection",
    properties: MOCK_PROPERTIES,
    conversationHistory: [],
    persona: PERSONA_COLOQUIAL,
    buyerInstructions: "Nada de esto te va. Sin pedir directamente 'más opciones', da a entender que buscas algo diferente: 'no hay nada más?', '¿eso es todo?'.",
    expectedOutcome: {
      wantsMoreOptions: true,
    },
  },
  {
    id: "wm-003",
    name: "NO pide más (satisfecho con una)",
    category: "wants_more_detection",
    properties: MOCK_PROPERTIES,
    conversationHistory: [],
    persona: PERSONA_DIRECTO,
    buyerInstructions: "Te gusta el piso de Salamanca (eval-001). Estás satisfecho, NO pidas más opciones.",
    expectedOutcome: {
      wantsMoreOptions: false,
      intention: "ME_ENCAJA",
      propertyFeedback: [{ propertyId: "eval-001", sentiment: "ME_INTERESA" }],
    },
  },
  {
    id: "wm-004",
    name: "Rechaza todo con criterios nuevos y pide más",
    category: "wants_more_detection",
    properties: MOCK_PROPERTIES,
    conversationHistory: [],
    persona: PERSONA_EXIGENTE,
    buyerInstructions: "Nada te sirve. Especifica que quieres algo con 4 habitaciones por debajo de 450k y pide que te muestren más opciones.",
    expectedOutcome: {
      wantsMoreOptions: true,
      intention: "NO_ME_ENCAJA",
      variableKeys: ["precioMax", "habitacionesMin"],
    },
  },
];
