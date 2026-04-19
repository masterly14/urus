/**
 * Procesa un mensaje del comprador en el banco de pruebas del NLU de micrositios.
 *
 * Body:
 *   { sessionId: string, mode: "manual" | "synthetic", text?: string,
 *     personaId?: string, turnNumber?: number }
 *
 * - mode=manual: usa `text` tal cual lo envió el usuario de la UI.
 * - mode=synthetic: genera el mensaje con `generateBuyerMessage` (misma
 *   suite eval) usando la persona indicada, las propiedades del microsite y
 *   el turno actual.
 *
 * Ejecuta el pipeline real (appendEvent + enqueueJob) contra los recursos
 * sintéticos creados al iniciar la sesión.
 */

import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getActiveTestSession } from "@/lib/test-nlu-microsite/session";
import {
  listTurnsForSession,
  runTurn,
  runConversationalTurn,
} from "@/lib/test-nlu-microsite/pipeline";
import { generateBuyerMessage } from "@/lib/eval/buyer-agent";
import { ALL_PERSONAS } from "@/lib/eval/personas";
import { ALL_SCENARIOS } from "@/lib/eval/scenarios";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type PostBody = {
  sessionId?: string;
  mode?: "manual" | "synthetic";
  pipeline?: "nlu" | "conversational";
  text?: string;
  personaId?: string;
  turnNumber?: number;
};

export async function POST(request: Request) {
  const appSession = await getSessionFromRequest(request);
  if (!appSession) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json(
      { error: "JSON inválido en body" },
      { status: 400 },
    );
  }

  const { sessionId, mode, pipeline, text, personaId, turnNumber } = body;
  if (!sessionId) {
    return NextResponse.json(
      { error: "Falta sessionId" },
      { status: 400 },
    );
  }

  const session = await getActiveTestSession();
  if (!session || session.sessionId !== sessionId) {
    return NextResponse.json(
      { error: "Sesión no encontrada o ya expirada" },
      { status: 404 },
    );
  }

  let messageText: string;
  let syntheticReasoning: string | null = null;

  try {
    if (mode === "synthetic") {
      const persona = personaId
        ? ALL_PERSONAS.find((p) => p.id === personaId)
        : ALL_PERSONAS[0];
      if (!persona) {
        return NextResponse.json(
          { error: `Persona desconocida: ${personaId}` },
          { status: 400 },
        );
      }

      // Si el contexto viene de un escenario, usamos sus buyerInstructions;
      // en otro caso generamos un prompt genérico con la persona.
      const scenario =
        session.context.scenarioId !== undefined
          ? ALL_SCENARIOS.find((s) => s.id === session.context.scenarioId)
          : undefined;

      const fallbackScenario = {
        id: `adhoc-${session.sessionId}`,
        name: "Ad-hoc test",
        category: "ambiguity_handling" as const,
        properties: session.context.summaryProperties,
        conversationHistory: [],
        persona,
        buyerInstructions:
          "Mira las propiedades y genera un mensaje realista de WhatsApp según tu persona. " +
          "Opcional: opina sobre alguna propiedad concreta o pide cambios.",
        expectedOutcome: {},
      };

      const buyerOutput = await generateBuyerMessage({
        persona,
        properties: session.context.summaryProperties,
        scenario: scenario ?? fallbackScenario,
        turnNumber: turnNumber && turnNumber > 0 ? turnNumber : 1,
        previousTurns: [],
      });

      messageText = buyerOutput.messageText;
      syntheticReasoning = buyerOutput.internalReasoning;
    } else {
      if (!text || !text.trim()) {
        return NextResponse.json(
          { error: "Falta text (mode=manual)" },
          { status: 400 },
        );
      }
      messageText = text.trim();
    }

    const useConversational = pipeline === "conversational";

    if (useConversational) {
      const convResult = await runConversationalTurn(session, messageText);
      const turns = await listTurnsForSession(session);

      return NextResponse.json({
        messageText,
        syntheticReasoning,
        pipeline: "conversational",
        result: convResult,
        turns,
      });
    }

    const turnResult = await runTurn(session, messageText);
    const turns = await listTurnsForSession(session);

    return NextResponse.json({
      messageText,
      syntheticReasoning,
      pipeline: "nlu",
      result: turnResult,
      turns,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[test-nlu-microsite/message] Error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
