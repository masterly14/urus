/**
 * Gestión de sesiones del banco de pruebas del NLU de micrositios.
 *
 * Una "sesión de test" materializa en Neon los recursos que el pipeline de
 * producción espera encontrar (DemandCurrent + MicrositeSelection +
 * WhatsAppBuyerSession + eventos seed de historial). Todos llevan prefijo
 * TEST-NLU-* para poder limpiarlos explícitamente al hacer reset.
 *
 * El waId del comprador es fijo (constants.TEST_BUYER_WAID): solo hay UNA
 * sesión activa por proceso y se reutiliza la misma instancia al iniciar
 * otra (reset implícito).
 */

import { randomBytes } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { JsonValue } from "@/lib/event-store/types";
import { appendEvent } from "@/lib/event-store";
import type { ConversationTurn } from "@/lib/agents";
import type { MicrositeCuratedProperty } from "@/lib/microsite/selection";
import type { ResolvedContext } from "./context-loader";
import {
  TEST_BUYER_WAID,
  TEST_COMERCIAL_ID,
  TEST_DEMAND_PREFIX,
  TEST_SELECTION_TOKEN_PREFIX,
} from "./constants";

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface TestNluSession {
  sessionId: string;
  selectionId: string;
  selectionToken: string;
  demandId: string;
  buyerWaId: string;
  comercialId: string;
  context: ResolvedContext;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeToken(prefix: string): string {
  const rand = randomBytes(12).toString("hex");
  return `${prefix}-${Date.now()}-${rand}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Extrae una demanda plausible desde las propiedades curadas para satisfacer
 * los campos obligatorios de DemandCurrent. No pretende ser una demanda real.
 */
function deriveDemandFromProperties(props: MicrositeCuratedProperty[]): {
  presupuestoMin: number;
  presupuestoMax: number;
  habitacionesMin: number;
  zonas: string;
  tipos: string;
  metrosMin: number | null;
  metrosMax: number | null;
} {
  const prices = props
    .map((p) => p.price)
    .filter((p): p is number => typeof p === "number" && p > 0);
  const rooms = props
    .map((p) => p.rooms)
    .filter((r): r is number => typeof r === "number" && r > 0);
  const zonas = Array.from(
    new Set(
      props
        .map((p) => p.zone)
        .filter((z): z is string => typeof z === "string" && z.length > 0),
    ),
  );
  const tipos = Array.from(
    new Set(
      props
        .map((p) => p.housing)
        .filter((h): h is string => typeof h === "string" && h.length > 0),
    ),
  );
  const metros = props
    .map((p) => p.metersBuilt)
    .filter((m): m is number => typeof m === "number" && m > 0);

  return {
    presupuestoMin: prices.length ? Math.min(...prices) : 0,
    presupuestoMax: prices.length ? Math.max(...prices) : 0,
    habitacionesMin: rooms.length ? Math.min(...rooms) : 0,
    zonas: zonas.slice(0, 5).join(","),
    tipos: tipos.slice(0, 3).join(","),
    metrosMin: metros.length ? Math.min(...metros) : null,
    metrosMax: metros.length ? Math.max(...metros) : null,
  };
}

async function persistHistorySeed(
  waId: string,
  turns: ConversationTurn[],
): Promise<void> {
  for (const t of turns) {
    const type = t.role === "buyer" ? "WHATSAPP_RECIBIDO" : "WHATSAPP_ENVIADO";
    const payload: JsonValue =
      t.role === "buyer"
        ? ({
            messageId: `seed-${randomBytes(6).toString("hex")}`,
            from: waId,
            timestamp: t.timestamp,
            type: "text",
            text: { body: t.text },
          } as unknown as JsonValue)
        : ({
            messageId: `seed-${randomBytes(6).toString("hex")}`,
            to: waId,
            timestamp: t.timestamp,
            kind: "history_seed",
            summary: t.text,
          } as unknown as JsonValue);

    await appendEvent({
      type,
      aggregateType: "WHATSAPP_CONVERSATION",
      aggregateId: waId,
      payload,
    });
  }
}

// ---------------------------------------------------------------------------
// Creación / obtención / limpieza
// ---------------------------------------------------------------------------

export async function createTestSession(
  context: ResolvedContext,
): Promise<TestNluSession> {
  // Limpia cualquier test previo del mismo waId para mantener una sola
  // sesión activa (reset implícito).
  await cleanupActiveSession();

  const demandId = makeToken(TEST_DEMAND_PREFIX);
  const derived = deriveDemandFromProperties(context.curatedProperties);
  const now = new Date();
  const demandName =
    context.spec.source === "scenario"
      ? `[${context.spec.id}] ${context.label}`
      : `[${context.spec.source}:${context.spec.id}] test NLU`;

  await prisma.demandCurrent.upsert({
    where: { codigo: demandId },
    create: {
      codigo: demandId,
      ref: "",
      nombre: demandName,
      estadoId: "test",
      estadoNombre: "Test NLU",
      presupuestoMin: derived.presupuestoMin,
      presupuestoMax: derived.presupuestoMax,
      habitacionesMin: derived.habitacionesMin,
      tipos: derived.tipos,
      zonas: derived.zonas,
      fechaActualizacion: now.toISOString(),
      agente: TEST_COMERCIAL_ID,
      comercialId: TEST_COMERCIAL_ID,
      lastEventId: "test-seed",
      lastEventPosition: BigInt(0),
      lastEventAt: now,
      telefono: TEST_BUYER_WAID,
      leadStatus: "NUEVO",
      metrosMin: derived.metrosMin,
      metrosMax: derived.metrosMax,
      tipoOperacion: null,
    },
    update: {},
  });

  const selectionToken = makeToken(TEST_SELECTION_TOKEN_PREFIX);

  const created = await prisma.micrositeSelection.create({
    data: {
      token: selectionToken,
      status: "APPROVED",
      demandId,
      demandNombre: demandName,
      comercialId: TEST_COMERCIAL_ID,
      statefoxQuery: {
        source: "test-nlu-microsite",
        contextSource: context.spec.source,
        contextId: context.spec.id,
      } as unknown as Prisma.InputJsonValue,
      resultFilters: {} as unknown as Prisma.InputJsonValue,
      properties: context.curatedProperties as unknown as Prisma.InputJsonValue,
      stockCount: context.curatedProperties.length,
      buyerPhone: TEST_BUYER_WAID,
    },
    select: { id: true, token: true },
  });

  await prisma.whatsAppBuyerSession.upsert({
    where: { waId: TEST_BUYER_WAID },
    create: {
      waId: TEST_BUYER_WAID,
      demandId,
      selectionId: created.id,
      selectionToken: created.token,
      turnCount: 0,
    },
    update: {
      demandId,
      selectionId: created.id,
      selectionToken: created.token,
      turnCount: 0,
      lastMessageAt: null,
      summary: null,
    },
  });

  if (context.conversationHistory.length > 0) {
    await persistHistorySeed(TEST_BUYER_WAID, context.conversationHistory);
  }

  return {
    sessionId: created.token,
    selectionId: created.id,
    selectionToken: created.token,
    demandId,
    buyerWaId: TEST_BUYER_WAID,
    comercialId: TEST_COMERCIAL_ID,
    context,
    createdAt: nowIso(),
  };
}

export async function getActiveTestSession(): Promise<TestNluSession | null> {
  const wabs = await prisma.whatsAppBuyerSession.findUnique({
    where: { waId: TEST_BUYER_WAID },
    select: {
      demandId: true,
      selectionId: true,
      selectionToken: true,
    },
  });

  if (!wabs?.selectionId || !wabs.selectionToken) return null;
  if (!wabs.demandId.startsWith(TEST_DEMAND_PREFIX)) {
    // Sesión pertenece a otro flujo, no la tocamos.
    return null;
  }

  const sel = await prisma.micrositeSelection.findUnique({
    where: { id: wabs.selectionId },
    select: {
      id: true,
      token: true,
      demandId: true,
      demandNombre: true,
      createdAt: true,
      statefoxQuery: true,
      properties: true,
    },
  });
  if (!sel) return null;

  // Reconstruye el contexto de forma perezosa desde el selection guardado.
  const { coerceMicrositeCuratedProperties } = await import(
    "@/lib/microsite/selection"
  );
  const curated = coerceMicrositeCuratedProperties(sel.properties);

  const meta = (sel.statefoxQuery ?? {}) as Record<string, unknown>;
  const contextSource =
    typeof meta.contextSource === "string"
      ? (meta.contextSource as "mock" | "scenario" | "real")
      : "mock";
  const contextId =
    typeof meta.contextId === "string" ? meta.contextId : "mock-madrid";

  const context: ResolvedContext = {
    spec: { source: contextSource, id: contextId } as ResolvedContext["spec"],
    label: sel.demandNombre,
    description: "",
    curatedProperties: curated,
    summaryProperties: curated.map((p) => ({
      propertyId: p.propertyId,
      title: p.title,
      price: p.price,
      zone: p.zone,
      city: p.city,
      metersBuilt: p.metersBuilt,
      rooms: p.rooms,
      extras: p.extras.slice(0, 5),
    })),
    conversationHistory: [],
  };

  return {
    sessionId: sel.token,
    selectionId: sel.id,
    selectionToken: sel.token,
    demandId: sel.demandId,
    buyerWaId: TEST_BUYER_WAID,
    comercialId: TEST_COMERCIAL_ID,
    context,
    createdAt: sel.createdAt.toISOString(),
  };
}

/**
 * Borra todos los recursos sintéticos (selection + demand + session + eventos
 * del conversation del waId de test + feedbacks). Idempotente.
 */
export async function cleanupActiveSession(): Promise<{
  removedSelection: boolean;
  removedDemand: boolean;
  removedSession: boolean;
  removedEvents: number;
}> {
  const wabs = await prisma.whatsAppBuyerSession.findUnique({
    where: { waId: TEST_BUYER_WAID },
    select: { demandId: true, selectionId: true },
  });

  let removedSelection = false;
  let removedDemand = false;
  let removedSession = false;

  if (wabs?.selectionId) {
    const sel = await prisma.micrositeSelection.findUnique({
      where: { id: wabs.selectionId },
      select: { id: true, token: true, demandId: true },
    });
    if (sel && sel.token.startsWith(TEST_SELECTION_TOKEN_PREFIX)) {
      await prisma.micrositeSelectionFeedback.deleteMany({
        where: { selectionId: sel.id },
      });
      await prisma.micrositeSelection.delete({ where: { id: sel.id } });
      removedSelection = true;
    }
  }

  if (wabs?.demandId?.startsWith(TEST_DEMAND_PREFIX)) {
    await prisma.demandCurrent
      .delete({ where: { codigo: wabs.demandId } })
      .then(() => {
        removedDemand = true;
      })
      .catch(() => {});
  }

  if (wabs) {
    await prisma.whatsAppBuyerSession.delete({
      where: { waId: TEST_BUYER_WAID },
    });
    removedSession = true;
  }

  // Borrar eventos del conversation del waId de test + eventos de los demandIds
  // sintéticos (SELECCION_COMPRADOR / DEMANDA_ACTUALIZADA).
  const evtsConv = await prisma.event.deleteMany({
    where: {
      aggregateType: "WHATSAPP_CONVERSATION",
      aggregateId: TEST_BUYER_WAID,
    },
  });

  const testDemands = await prisma.event.deleteMany({
    where: {
      aggregateType: "DEMAND",
      aggregateId: { startsWith: TEST_DEMAND_PREFIX },
    },
  });

  return {
    removedSelection,
    removedDemand,
    removedSession,
    removedEvents: evtsConv.count + testDemands.count,
  };
}
