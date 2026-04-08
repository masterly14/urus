import type { EvalScenario } from "../types";
import {
  PERSONA_COLOQUIAL,
  PERSONA_DIRECTO,
  PERSONA_EXIGENTE,
  PERSONA_EMOCIONAL,
  PERSONA_ARGOT,
} from "../personas";
import { MOCK_PROPERTIES } from "./mock-properties";
import { MOCK_PROPERTIES_CORDOBA } from "./mock-properties";

export const EDGE_CASE_SCENARIOS: EvalScenario[] = [
  {
    id: "ec-001",
    name: "Precio coloquial: '200 mil'",
    category: "edge_case",
    properties: MOCK_PROPERTIES,
    conversationHistory: [],
    persona: PERSONA_COLOQUIAL,
    buyerInstructions:
      "Nada de esto te vale. Tu presupuesto máximo es 200 mil euros. " +
      "Dilo usando '200 mil' (no '200.000' ni '200.000€'). Sé informal.",
    expectedOutcome: {
      intention: "NO_ME_ENCAJA",
      variableKeys: ["precioMax"],
    },
  },
  {
    id: "ec-002",
    name: "Precio con K: 'entre 300k y 400k'",
    category: "edge_case",
    properties: MOCK_PROPERTIES,
    conversationHistory: [],
    persona: PERSONA_DIRECTO,
    buyerInstructions:
      "Buscas algo entre 300k y 400k. Usa la abreviatura 'k' para miles. " +
      "El dúplex de Chamberí (eval-003, 395.000€) te encaja por precio.",
    expectedOutcome: {
      intention: "ME_ENCAJA",
      variableKeys: ["precioMin", "precioMax"],
      propertyFeedback: [{ propertyId: "eval-003", sentiment: "ME_INTERESA" }],
    },
  },
  {
    id: "ec-003",
    name: "Negación de extra: 'sin garaje'",
    category: "edge_case",
    properties: MOCK_PROPERTIES,
    conversationHistory: [],
    persona: PERSONA_EXIGENTE,
    buyerInstructions:
      "No quieres garaje, es un gasto innecesario. Prefieres algo con terraza " +
      "pero SIN garaje. Deja claro que rechazas el garaje.",
    expectedOutcome: {
      intention: "NO_ME_ENCAJA",
      variableKeys: ["extras", "extrasNoDeseados"],
    },
  },
  {
    id: "ec-004",
    name: "Respuesta ultra-corta: 'ok'",
    category: "edge_case",
    properties: MOCK_PROPERTIES,
    conversationHistory: [
      { role: "system", text: "[Enviado: microsite_link]", timestamp: "2026-04-01T10:00:00Z" },
    ],
    persona: PERSONA_DIRECTO,
    buyerInstructions:
      "Responde SOLO con 'ok' o 'vale'. Nada más. Una sola palabra.",
    expectedOutcome: {
      intention: "ME_ENCAJA",
    },
  },
  {
    id: "ec-005",
    name: "Respuesta ultra-corta negativa: 'no'",
    category: "edge_case",
    properties: MOCK_PROPERTIES,
    conversationHistory: [
      { role: "system", text: "[Enviado: microsite_link]", timestamp: "2026-04-01T10:00:00Z" },
    ],
    persona: PERSONA_DIRECTO,
    buyerInstructions:
      "Responde SOLO con 'no' o 'paso'. Nada más. Una sola palabra de rechazo.",
    expectedOutcome: {
      intention: "NO_ME_ENCAJA",
    },
  },
  {
    id: "ec-006",
    name: "Sinónimo tipología: 'apartamento céntrico'",
    category: "edge_case",
    properties: MOCK_PROPERTIES,
    conversationHistory: [],
    persona: PERSONA_ARGOT,
    buyerInstructions:
      "Quieres un apartamento céntrico (usa 'apartamento', no 'piso'). " +
      "También menciona que buscas en el centro. El NLU debería normalizar 'apartamento' a 'piso'.",
    expectedOutcome: {
      intention: "NO_ME_ENCAJA",
      variableKeys: ["tipos", "zonas"],
    },
  },
  {
    id: "ec-007",
    name: "Variable relativa: 'más grande que estas'",
    category: "edge_case",
    properties: MOCK_PROPERTIES,
    conversationHistory: [],
    persona: PERSONA_EXIGENTE,
    buyerInstructions:
      "Todo es demasiado pequeño. Dices que quieres algo MÁS GRANDE pero " +
      "sin dar un número concreto de metros. Solo 'más grande'. Pide ver más opciones.",
    expectedOutcome: {
      intention: "NO_ME_ENCAJA",
      wantsMoreOptions: true,
    },
  },
  {
    id: "ec-008",
    name: "Rango habitaciones: '2 o 3 dormitorios'",
    category: "edge_case",
    properties: MOCK_PROPERTIES,
    conversationHistory: [],
    persona: PERSONA_DIRECTO,
    buyerInstructions:
      "Buscas algo con 2 o 3 dormitorios. Dilo exactamente así: '2 o 3 dormitorios'. " +
      "El estudio (eval-004, 1 hab) es muy pequeño.",
    expectedOutcome: {
      intention: "NO_ME_ENCAJA",
      variableKeys: ["habitacionesMin"],
      propertyFeedback: [{ propertyId: "eval-004", sentiment: "NO_ME_ENCAJA" }],
    },
  },
  {
    id: "ec-009",
    name: "Múltiples variables en argot: 'cuartos, terraza, pavos'",
    category: "edge_case",
    properties: MOCK_PROPERTIES,
    conversationHistory: [],
    persona: PERSONA_ARGOT,
    buyerInstructions:
      "Quieres 3 cuartos (di 'cuartos'), con terraza, y máximo 350 pavos (usa 'pavos' para euros). " +
      "Mezcla todo en un solo mensaje informal. No uses lenguaje formal.",
    expectedOutcome: {
      intention: "NO_ME_ENCAJA",
      variableKeys: ["habitacionesMin", "extras", "precioMax"],
    },
  },
  {
    id: "ec-010",
    name: "Ciudad vs zona: 'en el centro de Córdoba'",
    category: "edge_case",
    properties: MOCK_PROPERTIES_CORDOBA,
    conversationHistory: [],
    persona: PERSONA_DIRECTO,
    buyerInstructions:
      "Te gusta el piso del Centro de Córdoba (eval-cor-001). Dilo como 'en el centro de Córdoba'. " +
      "El NLU debería separar ciudad=Córdoba y zonas=['Centro'].",
    expectedOutcome: {
      intention: "ME_ENCAJA",
      variableKeys: ["ciudad", "zonas"],
      propertyFeedback: [{ propertyId: "eval-cor-001", sentiment: "ME_INTERESA" }],
    },
  },
  {
    id: "ec-011",
    name: "Negación de tipo: 'que no sea un estudio'",
    category: "edge_case",
    properties: MOCK_PROPERTIES,
    conversationHistory: [],
    persona: PERSONA_EXIGENTE,
    buyerInstructions:
      "No quieres un estudio, es demasiado pequeño. Dilo explícitamente: " +
      "'que no sea un estudio'. El estudio de Malasaña (eval-004) no te interesa nada.",
    expectedOutcome: {
      intention: "NO_ME_ENCAJA",
      propertyFeedback: [{ propertyId: "eval-004", sentiment: "NO_ME_ENCAJA" }],
    },
  },
  {
    id: "ec-012",
    name: "Emoji como respuesta positiva con referencia",
    category: "edge_case",
    properties: MOCK_PROPERTIES,
    conversationHistory: [],
    persona: PERSONA_EMOCIONAL,
    buyerInstructions:
      "Te encanta la casa de Pozuelo (eval-005). Responde con muchos emojis positivos " +
      "(😍, ❤️, 👍) y una frase corta como 'me encanta esa!'. Sé muy expresivo emocionalmente.",
    expectedOutcome: {
      intention: "ME_ENCAJA",
      propertyFeedback: [{ propertyId: "eval-005", sentiment: "ME_INTERESA" }],
    },
  },
];
