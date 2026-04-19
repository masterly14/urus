/**
 * Juez AI del banco de pruebas. Solo disponible cuando el contexto proviene
 * de un escenario con expectedOutcome (ground truth).
 *
 * Body:
 *   { sessionId: string, buyerMessage: string, nluResult: NLUResult }
 */

import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getActiveTestSession } from "@/lib/test-nlu-microsite/session";
import { evaluateNLUResult } from "@/lib/eval/judge";
import { ALL_SCENARIOS } from "@/lib/eval/scenarios";
import type { NLUResult } from "@/lib/agents";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type PostBody = {
  sessionId?: string;
  buyerMessage?: string;
  nluResult?: NLUResult;
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

  const { sessionId, buyerMessage, nluResult } = body;
  if (!sessionId || !buyerMessage || !nluResult) {
    return NextResponse.json(
      { error: "Faltan sessionId, buyerMessage o nluResult" },
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

  const scenarioId = session.context.scenarioId;
  if (!scenarioId) {
    return NextResponse.json(
      {
        error:
          "Esta sesión no proviene de un escenario con expectedOutcome — no hay ground truth contra el que juzgar",
      },
      { status: 400 },
    );
  }

  const scenario = ALL_SCENARIOS.find((s) => s.id === scenarioId);
  if (!scenario) {
    return NextResponse.json(
      { error: `Escenario ${scenarioId} no encontrado en la suite` },
      { status: 404 },
    );
  }

  try {
    const evaluation = await evaluateNLUResult({
      scenario,
      buyerMessage,
      nluResult,
      properties: scenario.properties,
      expectedOutcome: scenario.expectedOutcome,
    });

    return NextResponse.json({
      evaluation,
      scenario: {
        id: scenario.id,
        name: scenario.name,
        category: scenario.category,
        expectedOutcome: scenario.expectedOutcome,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[test-nlu-microsite/judge] Error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
