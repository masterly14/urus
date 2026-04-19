import type { EvalScenario } from "../types";
import { PERSONA_EXIGENTE, PERSONA_DIRECTO, PERSONA_COLOQUIAL, PERSONA_MULTI } from "../personas";
import { MOCK_PROPERTIES } from "./mock-properties";

export const VARIABLE_EXTRACTION_SCENARIOS: EvalScenario[] = [
  {
    id: "ve-001",
    name: "Bajar presupuesto máximo",
    category: "variable_extraction",
    properties: MOCK_PROPERTIES,
    conversationHistory: [],
    persona: PERSONA_EXIGENTE,
    buyerInstructions: "Todas son muy caras. Deja claro que tu presupuesto máximo es 400.000€.",
    expectedOutcome: {
      intention: "NO_ME_ENCAJA",
      variableKeys: ["precioMax"],
    },
  },
  {
    id: "ve-002",
    name: "Cambiar zona preferida",
    category: "variable_extraction",
    properties: MOCK_PROPERTIES,
    conversationHistory: [],
    persona: PERSONA_DIRECTO,
    buyerInstructions: "Prefieres zona Retiro o Chamberí, las otras zonas no te interesan.",
    expectedOutcome: {
      intention: "NO_ME_ENCAJA",
      variableKeys: ["zonas"],
    },
  },
  {
    id: "ve-003",
    name: "Pedir más metros",
    category: "variable_extraction",
    properties: MOCK_PROPERTIES,
    conversationHistory: [],
    persona: PERSONA_EXIGENTE,
    buyerInstructions: "Necesitas al menos 120m². La mayoría son muy pequeñas para ti.",
    expectedOutcome: {
      intention: "NO_ME_ENCAJA",
      variableKeys: ["metrosMin"],
    },
  },
  {
    id: "ve-004",
    name: "Combinar varias variables",
    category: "variable_extraction",
    properties: MOCK_PROPERTIES,
    conversationHistory: [],
    persona: PERSONA_EXIGENTE,
    buyerInstructions: "Necesitas mínimo 3 habitaciones, máximo 500.000€, en Chamberí o Salamanca, y con garaje.",
    expectedOutcome: {
      intention: "NO_ME_ENCAJA",
      variableKeys: ["precioMax", "habitacionesMin", "zonas", "extras"],
    },
  },
  {
    id: "ve-005",
    name: "Variables en tono coloquial",
    category: "variable_extraction",
    properties: MOCK_PROPERTIES,
    conversationHistory: [],
    persona: PERSONA_COLOQUIAL,
    buyerInstructions: "Todo es muy caro y muy pequeño. Quieres algo por 300k-350k con al menos 100 metros. Dilo de forma informal.",
    expectedOutcome: {
      intention: "NO_ME_ENCAJA",
      variableKeys: ["precioMin", "precioMax", "metrosMin"],
    },
  },
];
