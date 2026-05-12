import type { EvalScenario } from "../types";
import { PERSONA_DIRECTO, PERSONA_COLOQUIAL, PERSONA_MULTI, PERSONA_INDECISO } from "../personas";
import { MOCK_PROPERTIES } from "./mock-properties";

export const SENTIMENT_ACCURACY_SCENARIOS: EvalScenario[] = [
  {
    id: "sa-001",
    name: "Gusto claro y explícito",
    category: "sentiment_accuracy",
    properties: MOCK_PROPERTIES,
    conversationHistory: [],
    persona: PERSONA_DIRECTO,
    buyerInstructions: "Te encanta el piso de Salamanca (eval-001). Exprésalo sin ambigüedad. Recuerda: el interés positivo se captura por el botón 'Me encaja' del micrositio, no por NLU.",
    expectedOutcome: {
      intention: "OTRO",
      propertyFeedback: [],
    },
  },
  {
    id: "sa-002",
    name: "Rechazo claro y explícito",
    category: "sentiment_accuracy",
    properties: MOCK_PROPERTIES,
    conversationHistory: [],
    persona: PERSONA_DIRECTO,
    buyerInstructions: "El estudio de Malasaña (eval-004) es demasiado pequeño, no te interesa nada. Sé claro en el rechazo.",
    expectedOutcome: {
      intention: "NO_ME_ENCAJA",
      propertyFeedback: [{ propertyId: "eval-004", sentiment: "NO_ME_ENCAJA" }],
    },
  },
  {
    id: "sa-003",
    name: "Sentimiento mixto: una sí, otra no",
    category: "sentiment_accuracy",
    properties: MOCK_PROPERTIES,
    conversationHistory: [],
    persona: PERSONA_MULTI,
    buyerInstructions: "El dúplex de Chamberí (eval-003) te gusta pero el ático de Chamartín (eval-002) es muy caro. Expresa ambas opiniones. Recuerda: el interés positivo no se captura por NLU, sólo el rechazo.",
    expectedOutcome: {
      intention: "NO_ME_ENCAJA",
      propertyFeedback: [
        { propertyId: "eval-002", sentiment: "NO_ME_ENCAJA" },
      ],
    },
  },
  {
    id: "sa-004",
    name: "Tono coloquial con sentimiento implícito",
    category: "sentiment_accuracy",
    properties: MOCK_PROPERTIES,
    conversationHistory: [],
    persona: PERSONA_COLOQUIAL,
    buyerInstructions: "La casa de Pozuelo (eval-005) te flipó. El estudio (eval-004) ni loco. Usa lenguaje informal. Recuerda: el interés positivo no se captura por NLU, sólo el rechazo.",
    expectedOutcome: {
      intention: "NO_ME_ENCAJA",
      propertyFeedback: [
        { propertyId: "eval-004", sentiment: "NO_ME_ENCAJA" },
      ],
    },
  },
  {
    id: "sa-005",
    name: "Indecisión: no hay sentimiento claro",
    category: "sentiment_accuracy",
    properties: MOCK_PROPERTIES,
    conversationHistory: [],
    persona: PERSONA_INDECISO,
    buyerInstructions: "Estás indeciso sobre todo. No te decides por ninguna propiedad. Expresa duda general sin comprometerte.",
    expectedOutcome: {
      intention: "NO_ME_ENCAJA",
      propertyFeedback: [],
    },
  },
];
