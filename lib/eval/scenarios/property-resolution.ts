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
    buyerInstructions: "Te gusta la propiedad de Salamanca (eval-001). Refiérete a ella por la zona.",
    expectedOutcome: {
      propertyFeedback: [{ propertyId: "eval-001", sentiment: "ME_INTERESA" }],
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
    buyerInstructions: "Te gusta la segunda propiedad de la lista (eval-002, el ático de Chamartín). Refiérete a ella por posición.",
    expectedOutcome: {
      propertyFeedback: [{ propertyId: "eval-002", sentiment: "ME_INTERESA" }],
    },
  },
  {
    id: "pr-004",
    name: "Referencia por extra (la de piscina)",
    category: "property_resolution",
    properties: MOCK_PROPERTIES,
    conversationHistory: [],
    persona: PERSONA_EMOCIONAL,
    buyerInstructions: "Te encanta la propiedad que tiene piscina y jardín (eval-005, la casa de Pozuelo). Refiérete a ella por la piscina/jardín.",
    expectedOutcome: {
      propertyFeedback: [{ propertyId: "eval-005", sentiment: "ME_INTERESA" }],
    },
  },
  {
    id: "pr-005",
    name: "Referencia por tipología (el dúplex)",
    category: "property_resolution",
    properties: MOCK_PROPERTIES,
    conversationHistory: [],
    persona: PERSONA_DIRECTO,
    buyerInstructions: "Te interesa el dúplex (eval-003, Chamberí). Refiérete a él por tipología.",
    expectedOutcome: {
      propertyFeedback: [{ propertyId: "eval-003", sentiment: "ME_INTERESA" }],
    },
  },
  {
    id: "pr-006",
    name: "Varias propiedades a la vez",
    category: "property_resolution",
    properties: MOCK_PROPERTIES,
    conversationHistory: [],
    persona: PERSONA_MULTI,
    buyerInstructions: "Te gustan la de Salamanca (eval-001) y el dúplex (eval-003). El ático (eval-002) no te gusta. Opina sobre las tres.",
    expectedOutcome: {
      propertyFeedback: [
        { propertyId: "eval-001", sentiment: "ME_INTERESA" },
        { propertyId: "eval-003", sentiment: "ME_INTERESA" },
        { propertyId: "eval-002", sentiment: "NO_ME_ENCAJA" },
      ],
    },
  },
];
