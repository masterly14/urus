import type { EvalScenario } from "../types";
import { PERSONA_DIRECTO, PERSONA_COLOQUIAL, PERSONA_NUMERICO, PERSONA_EMOCIONAL, PERSONA_MULTI } from "../personas";
import { MOCK_PROPERTIES } from "./mock-properties";

export const PROPERTY_RESOLUTION_SCENARIOS: EvalScenario[] = [
  {
    id: "pr-001",
    name: "Referencia por zona (Salamanca)",
    category: "property_resolution",
    properties: MOCK_PROPERTIES,
    conversationHistory: [],
    persona: PERSONA_COLOQUIAL,
    buyerInstructions: "Te gusta la propiedad de Salamanca (eval-001). Refiérete a ella por la zona. Recuerda: el interés positivo se captura por el botón 'Me encaja' del micrositio, no por NLU; el modelo debería devolver intention=OTRO y propertyFeedback=[].",
    expectedOutcome: {
      intention: "OTRO",
      propertyFeedback: [],
    },
  },
  {
    id: "pr-002",
    name: "Referencia por precio (la más cara)",
    category: "property_resolution",
    properties: MOCK_PROPERTIES,
    conversationHistory: [],
    persona: PERSONA_DIRECTO,
    buyerInstructions: "Rechaza la propiedad más cara (eval-005, la casa de Pozuelo a 890.000€). Dilo refiriéndote al precio.",
    expectedOutcome: {
      propertyFeedback: [{ propertyId: "eval-005", sentiment: "NO_ME_ENCAJA" }],
    },
  },
  {
    id: "pr-003",
    name: "Referencia por posición (la segunda)",
    category: "property_resolution",
    properties: MOCK_PROPERTIES,
    conversationHistory: [],
    persona: PERSONA_NUMERICO,
    buyerInstructions: "Te gusta la segunda propiedad de la lista (eval-002, el ático de Chamartín). Refiérete a ella por posición. Recuerda: el interés positivo se captura por botón en el micrositio, no por NLU.",
    expectedOutcome: {
      intention: "OTRO",
      propertyFeedback: [],
    },
  },
  {
    id: "pr-004",
    name: "Referencia por extra (la de piscina)",
    category: "property_resolution",
    properties: MOCK_PROPERTIES,
    conversationHistory: [],
    persona: PERSONA_EMOCIONAL,
    buyerInstructions: "Te encanta la propiedad que tiene piscina y jardín (eval-005, la casa de Pozuelo). Refiérete a ella por la piscina/jardín. Recuerda: el interés positivo se captura por botón en el micrositio, no por NLU.",
    expectedOutcome: {
      intention: "OTRO",
      propertyFeedback: [],
    },
  },
  {
    id: "pr-005",
    name: "Referencia por tipología (el dúplex)",
    category: "property_resolution",
    properties: MOCK_PROPERTIES,
    conversationHistory: [],
    persona: PERSONA_DIRECTO,
    buyerInstructions: "Te interesa el dúplex (eval-003, Chamberí). Refiérete a él por tipología. Recuerda: el interés positivo se captura por botón en el micrositio, no por NLU.",
    expectedOutcome: {
      intention: "OTRO",
      propertyFeedback: [],
    },
  },
  {
    id: "pr-006",
    name: "Varias propiedades a la vez",
    category: "property_resolution",
    properties: MOCK_PROPERTIES,
    conversationHistory: [],
    persona: PERSONA_MULTI,
    buyerInstructions: "Te gustan la de Salamanca (eval-001) y el dúplex (eval-003). El ático (eval-002) NO te gusta. Opina sobre las tres. Recuerda: el interés positivo (Salamanca y dúplex) se captura por botón en el micrositio, no por NLU. Sólo se debe registrar el rechazo al ático.",
    expectedOutcome: {
      intention: "NO_ME_ENCAJA",
      propertyFeedback: [
        { propertyId: "eval-002", sentiment: "NO_ME_ENCAJA" },
      ],
    },
  },
];
