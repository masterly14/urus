import type { EvalScenario } from "../types";
import { PERSONA_COLOQUIAL, PERSONA_MULTI, PERSONA_NUMERICO } from "../personas";
import { MOCK_PROPERTIES } from "./mock-properties";

export const MULTI_TURN_SCENARIOS: EvalScenario[] = [
  {
    id: "mt-001",
    name: "Segundo turno: referencia a mensaje previo",
    category: "multi_turn",
    properties: MOCK_PROPERTIES,
    conversationHistory: [
      { role: "system", text: "[Enviado: microsite_link]", timestamp: "2026-04-01T10:00:00Z" },
      { role: "buyer", text: "Me gusta la de Salamanca", timestamp: "2026-04-01T10:05:00Z" },
    ],
    persona: PERSONA_COLOQUIAL,
    buyerInstructions: "Ya dijiste que te gusta Salamanca. Ahora dices que la segunda (eval-002, ático Chamartín) también te gusta, 'esa del garaje y piscina'. Refiérete al historial. Recuerda: el interés positivo se captura por el botón 'Me encaja' del micrositio, no por NLU.",
    expectedOutcome: {
      intention: "OTRO",
      propertyFeedback: [],
    },
    turns: 2,
  },
  {
    id: "mt-002",
    name: "Cambio de opinión en segundo turno",
    category: "multi_turn",
    properties: MOCK_PROPERTIES,
    conversationHistory: [
      { role: "system", text: "[Enviado: microsite_link]", timestamp: "2026-04-01T10:00:00Z" },
      { role: "buyer", text: "El dúplex me parecía bien", timestamp: "2026-04-01T10:05:00Z" },
    ],
    persona: PERSONA_NUMERICO,
    buyerInstructions: "Antes te gustaba el dúplex (eval-003) pero ahora lo has pensado mejor y prefieres la casa de Pozuelo (eval-005, la última). Cambia de opinión. Recuerda: el interés positivo se captura por el botón 'Me encaja' del micrositio, no por NLU.",
    expectedOutcome: {
      intention: "OTRO",
      propertyFeedback: [],
    },
    turns: 2,
  },
  {
    id: "mt-003",
    name: "Acumulación: opiniones en turnos distintos",
    category: "multi_turn",
    properties: MOCK_PROPERTIES,
    conversationHistory: [
      { role: "system", text: "[Enviado: microsite_link]", timestamp: "2026-04-01T10:00:00Z" },
      { role: "buyer", text: "La de Salamanca y el dúplex me gustan", timestamp: "2026-04-01T10:05:00Z" },
      { role: "buyer", text: "El ático es caro", timestamp: "2026-04-01T10:08:00Z" },
    ],
    persona: PERSONA_MULTI,
    buyerInstructions: "Ya opinaste sobre tres propiedades. Ahora dices que el estudio de Malasaña (eval-004) es muy pequeño y la casa (eval-005) demasiado cara. Opina sobre las que faltan.",
    expectedOutcome: {
      propertyFeedback: [
        { propertyId: "eval-004", sentiment: "NO_ME_ENCAJA" },
        { propertyId: "eval-005", sentiment: "NO_ME_ENCAJA" },
      ],
    },
    turns: 3,
  },
];
