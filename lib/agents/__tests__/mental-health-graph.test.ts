import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MentalHealthGraphInput, MentalHealthClassification } from "../mental-health-types";

const mockClassifierInvoke = vi.fn();
const mockResponderInvoke = vi.fn();

vi.mock("../llm", () => ({
  llmMentalHealthClassifier: {
    withStructuredOutput: () => ({
      invoke: (...args: unknown[]) => mockClassifierInvoke(...args),
    }),
  },
  llmMentalHealth: {
    invoke: (...args: unknown[]) => mockResponderInvoke(...args),
  },
}));

import { processMentalHealthMessage } from "../mental-health-graph";

function makeInput(overrides?: Partial<MentalHealthGraphInput>): MentalHealthGraphInput {
  return {
    messageText: "Estoy bloqueado con un cierre",
    comercialId: null,
    waId: "34600111222",
    conversationHistory: [],
    sessionContext: {
      flujoActivo: null,
      turnCount: 0,
      nivelEnergia: null,
    },
    crmContext: null,
    ...overrides,
  };
}

function makeClassification(
  overrides?: Partial<MentalHealthClassification>,
): MentalHealthClassification {
  return {
    flujo: "bloqueo",
    subtipoBloqueo: "miedo",
    nivelEnergia: 2,
    focoDispersion: "disperso",
    urgencia: "media",
    reasoning: "Parece tener miedo al cierre",
    ...overrides,
  };
}

describe("processMentalHealthMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clasifica y genera respuesta para flujo de bloqueo", async () => {
    const classification = makeClassification({ flujo: "bloqueo", subtipoBloqueo: "miedo" });
    mockClassifierInvoke.mockResolvedValue(classification);
    mockResponderInvoke.mockResolvedValue({ content: "Dime, ¿qué parte del cierre te pesa?" });

    const result = await processMentalHealthMessage(makeInput());

    expect(result.classification.flujo).toBe("bloqueo");
    expect(result.classification.subtipoBloqueo).toBe("miedo");
    expect(result.responseText).toBe("Dime, ¿qué parte del cierre te pesa?");
    expect(mockClassifierInvoke).toHaveBeenCalledTimes(1);
    expect(mockResponderInvoke).toHaveBeenCalledTimes(1);
  });

  it("clasifica y genera respuesta para flujo de preparación", async () => {
    const classification = makeClassification({
      flujo: "preparacion",
      subtipoBloqueo: null,
      nivelEnergia: 4,
    });
    mockClassifierInvoke.mockResolvedValue(classification);
    mockResponderInvoke.mockResolvedValue({
      content: "Vale, cuéntame qué tienes. ¿Llamada, visita o cierre?",
    });

    const result = await processMentalHealthMessage(
      makeInput({ messageText: "Tengo un cierre en una hora y quiero prepararlo" }),
    );

    expect(result.classification.flujo).toBe("preparacion");
    expect(result.responseText).toContain("cuéntame");
  });

  it("clasifica flujo saludo para mensajes genéricos", async () => {
    const classification = makeClassification({
      flujo: "saludo",
      subtipoBloqueo: null,
      nivelEnergia: 3,
    });
    mockClassifierInvoke.mockResolvedValue(classification);
    mockResponderInvoke.mockResolvedValue({ content: "Buenas, ¿cómo andas? ¿Qué hay por ahí?" });

    const result = await processMentalHealthMessage(
      makeInput({ messageText: "Hola" }),
    );

    expect(result.classification.flujo).toBe("saludo");
    expect(result.responseText).toBeTruthy();
  });

  it("pasa historial conversacional al clasificador", async () => {
    const classification = makeClassification({ flujo: "descarga" });
    mockClassifierInvoke.mockResolvedValue(classification);
    mockResponderInvoke.mockResolvedValue({ content: "Cuéntame qué ha pasado." });

    await processMentalHealthMessage(
      makeInput({
        conversationHistory: [
          { role: "comercial", text: "Hoy ha sido un desastre" },
          { role: "coach", text: "¿Qué ha pasado?" },
        ],
      }),
    );

    const classifierCall = mockClassifierInvoke.mock.calls[0][0];
    const systemPrompt = classifierCall[0].content as string;
    expect(systemPrompt).toContain("Hoy ha sido un desastre");
  });

  it("inyecta contexto CRM en el prompt de respuesta", async () => {
    const classification = makeClassification({ flujo: "bloqueo" });
    mockClassifierInvoke.mockResolvedValue(classification);
    mockResponderInvoke.mockResolvedValue({ content: "A ver, Carlos..." });

    await processMentalHealthMessage(
      makeInput({
        crmContext: {
          nombreComercial: "Carlos",
          ciudad: "Málaga",
          cierresPendientesHoy: 2,
          operacionPerdidaReciente: true,
          rachaPositiva: false,
        },
      }),
    );

    const responderCall = mockResponderInvoke.mock.calls[0][0];
    const systemPrompt = responderCall[0].content as string;
    expect(systemPrompt).toContain("Carlos");
    expect(systemPrompt).toContain("Málaga");
    expect(systemPrompt).toContain("2 cierre(s)");
  });

  it("lanza error si el clasificador falla", async () => {
    mockClassifierInvoke.mockRejectedValue(new Error("API timeout"));

    await expect(
      processMentalHealthMessage(makeInput()),
    ).rejects.toThrow("clasificación mental health");
  });

  it("maneja contenido de respuesta no-string", async () => {
    const classification = makeClassification({ flujo: "enfoque" });
    mockClassifierInvoke.mockResolvedValue(classification);
    mockResponderInvoke.mockResolvedValue({ content: [{ text: "Respuesta compleja" }] });

    const result = await processMentalHealthMessage(makeInput());
    expect(result.responseText).toBeTruthy();
  });
});
