import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import type { BuyerAgentInput, BuyerAgentOutput, PropertySummaryForNLU } from "./types";

const buyerLlm = new ChatOpenAI({
  model: "gpt-5.4-mini",
  temperature: 0.7,
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30_000,
});

const BuyerOutputSchema = z.object({
  messageText: z.string().describe("El mensaje de WhatsApp que enviaría el comprador. En español, natural, sin IDs técnicos."),
  internalReasoning: z.string().describe("Razonamiento interno de por qué elegiste este mensaje (para auditoría)."),
});

const buyerLlmStructured = buyerLlm.withStructuredOutput(BuyerOutputSchema, {
  name: "generar_mensaje_comprador",
});

function formatProperties(properties: PropertySummaryForNLU[]): string {
  return properties.map((p, i) => {
    const parts = [`${i + 1}. ${p.title}`];
    if (p.price != null) parts.push(`${p.price.toLocaleString("es-ES")}€`);
    if (p.metersBuilt != null) parts.push(`${p.metersBuilt}m²`);
    if (p.rooms != null) parts.push(`${p.rooms} hab`);
    if (p.zone) parts.push(p.zone);
    if (p.extras.length > 0) parts.push(p.extras.join(", "));
    return parts.join(" | ");
  }).join("\n");
}

export async function generateBuyerMessage(input: BuyerAgentInput): Promise<BuyerAgentOutput> {
  const { persona, properties, scenario, turnNumber, previousTurns } = input;

  const historyBlock = previousTurns.length > 0
    ? "\n\nMensajes previos en la conversación:\n" + previousTurns.map((t) =>
        `[${t.role === "buyer" ? "Tú" : "Sistema"}]: ${t.text}`
      ).join("\n")
    : "";

  const systemPrompt = `${persona.systemPrompt}

IMPORTANTE:
- Genera UN SOLO mensaje de WhatsApp como lo haría un comprador real.
- NUNCA uses IDs técnicos (eval-001, sfx-001, etc.). NUNCA.
- Refiérete a las propiedades de forma natural: por zona, precio, posición, características.
- El mensaje debe parecer escrito en un móvil, en español de España.
- Turno actual: ${turnNumber}${historyBlock}`;

  const userPrompt = `Estas son las propiedades que estás viendo en tu microsite:

${formatProperties(properties)}

Tu tarea: ${scenario.buyerInstructions}

Genera el mensaje de WhatsApp.`;

  const result = await buyerLlmStructured.invoke([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);

  return {
    messageText: result.messageText,
    internalReasoning: result.internalReasoning,
  };
}
