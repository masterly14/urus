import { describe, expect, it } from "vitest";
import { normalizePostVisitContext } from "../post-visit-context-normalizer";
import { evaluatePostVisitPolicy } from "../post-visit-policy";

describe("evaluatePostVisitPolicy", () => {
  it("promueve automáticamente hard constraints de alta claridad si no hay conflicto", () => {
    const structured = normalizePostVisitContext("Quiere mínimo 3 habitaciones y hasta 230k.");
    const decision = evaluatePostVisitPolicy({
      structured,
      buyerText: "Enséñame opciones",
      nlu: {
        intention: "ME_ENCAJA",
        confidence: 0.8,
        propertyFeedback: [],
        variables: {},
        rawText: "Enséñame opciones",
      },
    });

    expect(decision).toMatchObject({
      action: "emit_update",
      ruleApplied: "auto_hard_rule",
      variables: {
        habitacionesMin: 3,
        precioMax: 230000,
      },
    });
  });

  it("pide confirmación para preferencias soft sin variables del comprador", () => {
    const structured = normalizePostVisitContext("Le gustaría terraza y evitar ruido.");
    const decision = evaluatePostVisitPolicy({
      structured,
      buyerText: "Gracias",
      nlu: {
        intention: "ME_ENCAJA",
        confidence: 0.8,
        propertyFeedback: [],
        variables: {},
        rawText: "Gracias",
      },
    });

    expect(decision).toMatchObject({
      action: "ask_confirmation",
      ruleApplied: "requires_buyer_confirmation",
    });
  });

  it("si el comprador corrige, prevalecen sus variables", () => {
    const structured = normalizePostVisitContext("Quiere mínimo 3 habitaciones y hasta 230k.");
    const decision = evaluatePostVisitPolicy({
      structured,
      buyerText: "No, realmente hasta 200k y 2 habitaciones",
      nlu: {
        intention: "NO_ME_ENCAJA",
        confidence: 0.91,
        propertyFeedback: [],
        variables: {
          precioMax: 200000,
          habitacionesMin: 2,
        },
        rawText: "No, realmente hasta 200k y 2 habitaciones",
      },
    });

    expect(decision).toMatchObject({
      action: "emit_update",
      ruleApplied: "buyer_confirmed",
      variables: {
        precioMax: 200000,
        habitacionesMin: 2,
      },
    });
  });
});
