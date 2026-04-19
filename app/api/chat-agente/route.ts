/**
 * Chat interactivo contra el agente conversacional.
 *
 * - Sin side-effects: usa el sandbox (`runConversationalAgentSandboxed`).
 *   No escribe eventos en Event Store, no encola jobs, no envía WhatsApp.
 *
 * - Reutiliza EXACTAMENTE el mismo system prompt y la misma lógica ReAct
 *   que el agente de producción. Lo único que cambia son los tools con
 *   efectos colaterales (que responden con mocks).
 *
 * - Stateless: el cliente envía todo el contexto (propiedades, historial,
 *   fase, digest) en cada request. Así el estado vive en React del browser
 *   y se puede "resetear" con un botón sin tocar BD.
 *
 * - Acceso restringido a CEO/Admin (herramienta de debug interna).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest, isCeoOrAdmin, unauthorized, forbidden } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { runConversationalAgentSandboxed } from "@/lib/agents/conversational-sandbox";
import type {
  ConversationalAgentInput,
  ConversationPhase,
} from "@/lib/agents/conversational-agent-types";
import type { ConversationTurn, PropertySummaryForNLU } from "@/lib/agents/types";
import { MOCK_PROPERTIES, MOCK_PROPERTIES_CORDOBA } from "@/lib/eval/scenarios/mock-properties";

// ── Contexts precargados ────────────────────────────────────────────────────

interface ChatContextPreset {
  id: string;
  label: string;
  description: string;
  properties: PropertySummaryForNLU[];
  defaultPhase: ConversationPhase;
  defaultDigest: string | null;
  defaultHistory: ConversationTurn[];
}

const PRESETS: ChatContextPreset[] = [
  {
    id: "madrid-fresh",
    label: "Madrid — primer contacto",
    description:
      "5 propiedades en Madrid (Salamanca, Chamartín, Chamberí, Malasaña, Pozuelo). Comprador recién llegado al microsite.",
    properties: MOCK_PROPERTIES,
    defaultPhase: "INITIAL_CONTACT",
    defaultDigest: null,
    defaultHistory: [],
  },
  {
    id: "madrid-reviewing",
    label: "Madrid — revisando opciones",
    description:
      "Mismo listado de Madrid, pero el comprador ya ha visto el microsite y tiene un perfil definido.",
    properties: MOCK_PROPERTIES,
    defaultPhase: "REVIEWING_OPTIONS",
    defaultDigest: "Comprador activo, presupuesto ~500k, zona Salamanca/Chamartín, busca 3 habitaciones",
    defaultHistory: [],
  },
  {
    id: "cordoba-fresh",
    label: "Córdoba — primer contacto",
    description:
      "5 propiedades en Córdoba con rango de precios más bajo. Comprador recién llegado al microsite.",
    properties: MOCK_PROPERTIES_CORDOBA,
    defaultPhase: "INITIAL_CONTACT",
    defaultDigest: null,
    defaultHistory: [],
  },
  {
    id: "empty-onboarding",
    label: "Sin propiedades — onboarding",
    description:
      "El comprador aún no tiene microsite asignado. Útil para probar conversaciones de recogida de preferencias.",
    properties: [],
    defaultPhase: "INITIAL_CONTACT",
    defaultDigest: null,
    defaultHistory: [],
  },
];

// ── GET: lista los contextos disponibles ────────────────────────────────────

const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

  return NextResponse.json({
    presets: PRESETS.map((p) => ({
      id: p.id,
      label: p.label,
      description: p.description,
      propertyCount: p.properties.length,
      defaultPhase: p.defaultPhase,
      defaultDigest: p.defaultDigest,
      properties: p.properties,
    })),
  });
};

// ── POST: procesa un turno del comprador ────────────────────────────────────

const conversationPhaseSchema = z.enum([
  "INITIAL_CONTACT",
  "REVIEWING_OPTIONS",
  "GIVING_FEEDBACK",
  "SCHEDULING_VISIT",
  "IDLE_FOLLOWUP",
  "UNKNOWN",
]);

const propertySummarySchema = z.object({
  propertyId: z.string(),
  title: z.string(),
  price: z.number().nullable(),
  zone: z.string().nullable(),
  city: z.string().nullable(),
  metersBuilt: z.number().nullable(),
  rooms: z.number().nullable(),
  extras: z.array(z.string()),
});

const conversationTurnSchema = z.object({
  role: z.enum(["buyer", "system"]),
  text: z.string(),
  timestamp: z.string(),
});

const bodySchema = z.object({
  messageText: z.string().min(1).max(2000),
  properties: z.array(propertySummarySchema),
  conversationHistory: z.array(conversationTurnSchema),
  conversationPhase: conversationPhaseSchema,
  buyerDigest: z.string().nullable(),
});

const postHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

  const rawBody = await request.json();
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Body inválido", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const input: ConversationalAgentInput = {
    messageText: parsed.data.messageText,
    buyerWaId: "chat-agente-sandbox",
    demandId: "chat-agente-sandbox",
    selectionId: null,
    properties: parsed.data.properties,
    conversationHistory: parsed.data.conversationHistory,
    buyerDigest: parsed.data.buyerDigest,
    conversationPhase: parsed.data.conversationPhase,
  };

  const started = Date.now();
  try {
    const output = await runConversationalAgentSandboxed(input);
    const latencyMs = Date.now() - started;

    return NextResponse.json({
      responseText: output.responseText,
      toolResults: output.toolResults,
      nextPhase: output.nextPhase,
      nluResult: output.nluResult ?? null,
      latencyMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `El agente falló: ${message}` },
      { status: 500 },
    );
  }
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/chat-agente" },
  getHandler,
);

export const POST = withObservedRoute(
  { method: "POST", route: "/api/chat-agente" },
  postHandler,
);
