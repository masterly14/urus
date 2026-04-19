/**
 * Banco de pruebas del NLU de micrositios — endpoints de setup.
 *
 * GET    (sin param)     → catálogo (mocks, escenarios, selections reales) +
 *                          sesión activa si existe.
 * GET    ?sessionId=...  → estado de la sesión + turnos ya procesados.
 * POST                   → crea una sesión con el contexto elegido
 *                          (spec = { source, id }).
 * DELETE ?sessionId=...  → limpia todos los recursos sintéticos (reset).
 *
 * Autenticación: requiere usuario logueado.
 */

import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import {
  listMockContexts,
  listScenarios,
  listRealSelections,
  resolveContext,
  type ContextSpec,
} from "@/lib/test-nlu-microsite/context-loader";
import {
  createTestSession,
  cleanupActiveSession,
  getActiveTestSession,
} from "@/lib/test-nlu-microsite/session";
import { listTurnsForSession } from "@/lib/test-nlu-microsite/pipeline";
import { ALL_PERSONAS } from "@/lib/eval/personas";
import { TEST_BUYER_WAID } from "@/lib/test-nlu-microsite/constants";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const appSession = await getSessionFromRequest(request);
  if (!appSession) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  if (sessionId) {
    const active = await getActiveTestSession();
    if (!active || active.sessionId !== sessionId) {
      return NextResponse.json(
        { error: "Sesión no encontrada o ya expirada" },
        { status: 404 },
      );
    }
    const turns = await listTurnsForSession(active);
    return NextResponse.json({
      session: serializeSession(active),
      turns,
    });
  }

  const [mocks, scenarios, reals, active] = await Promise.all([
    Promise.resolve(listMockContexts()),
    Promise.resolve(listScenarios()),
    listRealSelections(20).catch((err) => {
      console.warn("[test-nlu-microsite] listRealSelections falló:", err);
      return [];
    }),
    getActiveTestSession(),
  ]);

  return NextResponse.json({
    buyerWaId: TEST_BUYER_WAID,
    catalog: {
      mocks,
      scenarios,
      reals,
    },
    personas: ALL_PERSONAS.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
    })),
    activeSession: active ? serializeSession(active) : null,
    activeTurns: active ? await listTurnsForSession(active) : [],
  });
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const appSession = await getSessionFromRequest(request);
  if (!appSession) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  let body: { spec?: ContextSpec };
  try {
    body = (await request.json()) as { spec?: ContextSpec };
  } catch {
    return NextResponse.json(
      { error: "JSON inválido en body" },
      { status: 400 },
    );
  }

  const spec = body.spec;
  if (
    !spec ||
    !spec.source ||
    !spec.id ||
    !["mock", "scenario", "real"].includes(spec.source)
  ) {
    return NextResponse.json(
      {
        error:
          "spec inválido. Formato esperado: { source: 'mock'|'scenario'|'real', id: string }",
      },
      { status: 400 },
    );
  }

  try {
    const context = await resolveContext(spec);
    const session = await createTestSession(context);
    const turns = await listTurnsForSession(session);
    return NextResponse.json({
      session: serializeSession(session),
      turns,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[test-nlu-microsite] Error creando sesión:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

export async function DELETE(request: Request) {
  const appSession = await getSessionFromRequest(request);
  if (!appSession) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  try {
    const result = await cleanupActiveSession();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[test-nlu-microsite] Error en cleanup:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function serializeSession(session: Awaited<ReturnType<typeof getActiveTestSession>>) {
  if (!session) return null;
  return {
    sessionId: session.sessionId,
    selectionId: session.selectionId,
    selectionToken: session.selectionToken,
    demandId: session.demandId,
    buyerWaId: session.buyerWaId,
    comercialId: session.comercialId,
    createdAt: session.createdAt,
    context: {
      source: session.context.spec.source,
      id: session.context.spec.id,
      label: session.context.label,
      description: session.context.description,
      properties: session.context.curatedProperties.map((p) => ({
        propertyId: p.propertyId,
        title: p.title,
        price: p.price,
        zone: p.zone,
        city: p.city,
        metersBuilt: p.metersBuilt,
        rooms: p.rooms,
        extras: p.extras.slice(0, 8),
        image: p.images[0] ?? null,
      })),
      conversationHistorySeed: session.context.conversationHistory,
      scenarioId: session.context.scenarioId ?? null,
      personaId: session.context.personaId ?? null,
      expectedOutcome: session.context.expectedOutcome ?? null,
      buyerInstructions: session.context.buyerInstructions ?? null,
    },
  };
}
