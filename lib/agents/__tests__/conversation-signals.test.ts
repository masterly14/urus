import { describe, it, expect } from "vitest";
import {
  computeConversationSignals,
  countTrailingSummaryStreak,
  evaluateCriteria,
  isAskingForOptions,
  isMinimalAffirmation,
  isRequestingHuman,
  isSummaryAndAskOutbound,
  shouldForceSearchFallback,
} from "../conversation-signals";
import type { ConversationTurn } from "../types";

function turn(role: "buyer" | "system", text: string): ConversationTurn {
  return { role, text, timestamp: new Date().toISOString() };
}

describe("isMinimalAffirmation", () => {
  it.each([
    "Sí",
    "si",
    "SI",
    "Ok",
    "ok.",
    "Vale",
    "Perfecto",
    "Claro 👍",
    "Adelante",
    "Dale",
    "venga",
  ])("detecta confirmación corta: %s", (text) => {
    expect(isMinimalAffirmation(text)).toBe(true);
  });

  it.each([
    "Sí, prefiero Centro",
    "ok pero quiero 3 habitaciones",
    "no",
    "no me convence",
    "sí 200000",
  ])("rechaza %s como confirmación corta", (text) => {
    expect(isMinimalAffirmation(text)).toBe(false);
  });
});

describe("isAskingForOptions", () => {
  it.each([
    "Que opciones tienes",
    "¿Qué me ofreces?",
    "Enséñame algo",
    "muéstrame propiedades",
    "Quiero ver más",
    "dame opciones",
    "mándame propuestas",
    "Hay algo más?",
    "no tienes nada más?",
    "buscame algo en Sevilla",
    "Adelante con la búsqueda",
  ])("detecta solicitud de opciones: %s", (text) => {
    expect(isAskingForOptions(text)).toBe(true);
  });

  it.each([
    "Cordoba",
    "85.000€",
    "tengo dudas con la hipoteca",
    "gracias",
  ])("rechaza como solicitud: %s", (text) => {
    expect(isAskingForOptions(text)).toBe(false);
  });
});

describe("isRequestingHuman", () => {
  it.each([
    "quiero hablar con alguien",
    "pásame con un comercial",
    "Necesito un asesor",
    "que me llame por favor",
  ])("detecta petición de humano: %s", (text) => {
    expect(isRequestingHuman(text)).toBe(true);
  });

  it("rechaza mensaje genérico", () => {
    expect(isRequestingHuman("Cordoba")).toBe(false);
  });
});

describe("isSummaryAndAskOutbound", () => {
  it("detecta el patrón resumen + ¿quieres seguir?", () => {
    const text =
      "Perfecto, me quedo con *Córdoba* como zona. Tengo apuntado un presupuesto de 65.000–85.000€ y al menos 1 habitación. Si quieres, sigo afinando opciones.";
    expect(isSummaryAndAskOutbound(text)).toBe(true);
  });

  it("no detecta una respuesta operativa", () => {
    const text =
      "Voy a por ello. Lanzo la búsqueda con lo que tengo apuntado y te llega en unos 30 minutos.";
    expect(isSummaryAndAskOutbound(text)).toBe(false);
  });
});

describe("countTrailingSummaryStreak", () => {
  it("cuenta los últimos turnos consecutivos del bot que son resumen + pregunta", () => {
    const history: ConversationTurn[] = [
      turn("buyer", "Cordoba"),
      turn(
        "system",
        "Perfecto, me quedo con Córdoba. Tengo apuntado presupuesto 65–85k. Si quieres sigo afinando opciones.",
      ),
      turn("buyer", "Si"),
      turn(
        "system",
        "Perfecto, tengo apuntado: Córdoba, 65–85k, 1 hab. Si quieres, te preparo opciones.",
      ),
    ];
    expect(countTrailingSummaryStreak(history)).toBe(2);
  });

  it("se reinicia cuando hay un turno de bot que avanza", () => {
    const history: ConversationTurn[] = [
      turn(
        "system",
        "Perfecto, tengo apuntado: Córdoba, 65–85k. Si quieres te preparo opciones.",
      ),
      turn("buyer", "Si"),
      turn(
        "system",
        "Voy a por ello. Te preparo opciones y un compañero las revisa antes de enviártelas.",
      ),
    ];
    expect(countTrailingSummaryStreak(history)).toBe(0);
  });
});

describe("evaluateCriteria", () => {
  it("acepta zona + presupuesto como mínimo suficiente", () => {
    const r = evaluateCriteria({
      zonas: "Córdoba",
      presupuestoMax: 85000,
      habitacionesMin: null,
      tipos: null,
    });
    expect(r.hasMinimumCriteria).toBe(true);
    expect(r.missingHelpfulFields).toContain("habitaciones");
  });

  it("rechaza si no hay zona ni ciudad", () => {
    const r = evaluateCriteria({
      zonas: "",
      presupuestoMax: 85000,
      habitacionesMin: 2,
    });
    expect(r.hasMinimumCriteria).toBe(false);
    expect(r.missingHelpfulFields).toContain("ciudad_o_zona");
  });

  it("rechaza si solo hay zona sin ningún criterio adicional", () => {
    const r = evaluateCriteria({ zonas: "Córdoba" });
    expect(r.hasMinimumCriteria).toBe(false);
  });
});

describe("computeConversationSignals", () => {
  it("marca buyer_confirmed cuando el bot invitó y el comprador dijo 'sí'", () => {
    const signals = computeConversationSignals({
      messageText: "Si",
      conversationHistory: [
        turn(
          "system",
          "Si quieres, sigo afinando opciones para que te encajen mejor.",
        ),
      ],
      demandCriteria: { zonas: "Córdoba", presupuestoMax: 85000 },
    });
    expect(signals.buyerConfirmedToProceed).toBe(true);
    expect(signals.lastBotInvitedToProceed).toBe(true);
    expect(signals.hasMinimumCriteria).toBe(true);
  });

  it("marca buyer_asked cuando el comprador pregunta por opciones", () => {
    const signals = computeConversationSignals({
      messageText: "Que opciones tienes",
      conversationHistory: [],
      demandCriteria: { zonas: "Córdoba", presupuestoMax: 85000 },
    });
    expect(signals.buyerAskedForOptions).toBe(true);
  });
});

describe("shouldForceSearchFallback", () => {
  const baseSignals = {
    hasMinimumCriteria: true,
    missingHelpfulFields: [],
    recentSummaryStreak: 0,
    lastBotInvitedToProceed: false,
    lastBotPromisedSearch: false,
    buyerAskedForOptions: false,
    buyerConfirmedToProceed: false,
    buyerRequestedHuman: false,
  } as const;

  it("no fuerza si ya hay selección activa", () => {
    expect(
      shouldForceSearchFallback({
        signals: { ...baseSignals, buyerAskedForOptions: true },
        hasSelection: true,
        agentInvokedSearchTool: false,
      }),
    ).toEqual({ force: false, reason: null });
  });

  it("no fuerza si el agente ya llamó a una tool de búsqueda", () => {
    expect(
      shouldForceSearchFallback({
        signals: { ...baseSignals, buyerAskedForOptions: true },
        hasSelection: false,
        agentInvokedSearchTool: true,
      }),
    ).toEqual({ force: false, reason: null });
  });

  it("fuerza por petición explícita del comprador", () => {
    expect(
      shouldForceSearchFallback({
        signals: { ...baseSignals, buyerAskedForOptions: true },
        hasSelection: false,
        agentInvokedSearchTool: false,
      }),
    ).toEqual({ force: true, reason: "buyer_asked" });
  });

  it("fuerza por confirmación del comprador tras invitación del bot", () => {
    expect(
      shouldForceSearchFallback({
        signals: { ...baseSignals, buyerConfirmedToProceed: true },
        hasSelection: false,
        agentInvokedSearchTool: false,
      }),
    ).toEqual({ force: true, reason: "buyer_confirmed" });
  });

  it("fuerza por bucle detectado cuando hay criterios mínimos", () => {
    expect(
      shouldForceSearchFallback({
        signals: { ...baseSignals, recentSummaryStreak: 2, hasMinimumCriteria: true },
        hasSelection: false,
        agentInvokedSearchTool: false,
      }),
    ).toEqual({ force: true, reason: "loop_detected" });
  });

  it("no fuerza por bucle si no hay criterios mínimos", () => {
    expect(
      shouldForceSearchFallback({
        signals: { ...baseSignals, recentSummaryStreak: 3, hasMinimumCriteria: false },
        hasSelection: false,
        agentInvokedSearchTool: false,
      }),
    ).toEqual({ force: false, reason: null });
  });
});
