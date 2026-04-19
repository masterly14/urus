/**
 * API para el simulador interactivo de agendamiento de visitas.
 *
 * GET  ?sessionId  → estado de la sesión + mensajes capturados.
 * GET  (sin param) → datos de setup: propiedades + comercial disponible.
 * POST             → inicia una nueva sesión (BD real + Composio real).
 * DELETE ?sessionId → cleanup de datos de test.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/auth/session";
import {
  loadComercialForInteractiveTest,
  canAccessTestVisitSession,
} from "@/lib/visit-scheduling/test-visit-session";
import { setTestSendInterceptor } from "@/lib/whatsapp/send";
import {
  captureOutboundRaw,
  startCapture,
  stopCapture,
  discardCapture,
  registerSessionMeta,
  getMessagesForSession,
  clearSession,
} from "@/lib/visit-scheduling/test-message-store";
import { initiateVisitScheduling } from "@/lib/visit-scheduling/orchestrator";
import { getSessionById } from "@/lib/visit-scheduling/session-manager";
import { resolveComercialByProperty } from "@/lib/routing/resolve-comercial";
import { extractRefCode } from "@/lib/routing/parse-ref-code";

const TEST_BUYER_WAID = "34600999888";
const TEST_DEMAND_PREFIX = "TEST-VISIT-DEM";

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  if (sessionId) {
    try {
      const appSession = await getSessionFromRequest(request);
      if (!appSession) {
        return NextResponse.json(
          { error: "No autenticado" },
          { status: 401 },
        );
      }

      const session = await prisma.visitSchedulingSession.findUnique({
        where: { id: sessionId },
      });
      if (!session) {
        return NextResponse.json(
          { error: "Sesión no encontrada" },
          { status: 404 },
        );
      }
      if (!canAccessTestVisitSession(appSession, session.comercialId)) {
        return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
      }
      return NextResponse.json({
        session: serializeSession(session),
        messages: getMessagesForSession(sessionId),
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      );
    }
  }

  const appSession = await getSessionFromRequest(request);
  if (!appSession) {
    return NextResponse.json(
      {
        properties: [],
        comercial: null,
        testBuyerWaId: TEST_BUYER_WAID,
        error: "No autenticado",
      },
      { status: 401 },
    );
  }

  const comercial = await loadComercialForInteractiveTest(appSession);

  if (!comercial) {
    return NextResponse.json({
      properties: [],
      comercial: null,
      testBuyerWaId: TEST_BUYER_WAID,
      error: appSession.comercialId
        ? "No se encontró tu ficha de comercial activa"
        : "Tu cuenta no tiene un comercial vinculado",
    });
  }

  const propertySelect = {
    codigo: true,
    ref: true,
    titulo: true,
    ciudad: true,
    zona: true,
    precio: true,
    habitaciones: true,
    metrosConstruidos: true,
    agente: true,
    comercialId: true,
  } as const;

  const primary = await prisma.propertyCurrent.findMany({
    where: {
      nodisponible: false,
      OR: [
        { comercialId: comercial.id },
        { agente: comercial.nombre },
      ],
    },
    select: propertySelect,
    take: 80,
    orderBy: { codigo: "asc" },
  });

  const refCode = comercial.inmovillaRefCode?.trim().toUpperCase() ?? "";
  const byCode = new Map(primary.map((p) => [p.codigo, p]));

  if (refCode) {
    const existingCodes = [...byCode.keys()];
    const refCandidates = await prisma.propertyCurrent.findMany({
      where: {
        nodisponible: false,
        ref: { startsWith: "URUS", mode: "insensitive" },
        ...(existingCodes.length > 0
          ? { codigo: { notIn: existingCodes } }
          : {}),
      },
      select: propertySelect,
      take: 300,
      orderBy: { codigo: "asc" },
    });
    for (const p of refCandidates) {
      if (extractRefCode(p.ref ?? "") === refCode) {
        byCode.set(p.codigo, p);
      }
    }
  }

  const properties = [...byCode.values()]
    .sort((a, b) => a.codigo.localeCompare(b.codigo))
    .slice(0, 50);

  return NextResponse.json({
    properties,
    comercial: {
      id: comercial.id,
      nombre: comercial.nombre,
      waId: comercial.waId,
      composioConnected: Boolean(comercial.composioConnectionId),
    },
    testBuyerWaId: TEST_BUYER_WAID,
  });
}

// ---------------------------------------------------------------------------
// POST — Start test session
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const appSession = await getSessionFromRequest(request);
  if (!appSession) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await request.json();
  const propertyCode = body.propertyCode as string;

  if (!propertyCode) {
    return NextResponse.json(
      { error: "Se requiere propertyCode" },
      { status: 400 },
    );
  }

  const comercial = await loadComercialForInteractiveTest(appSession);
  if (!comercial) {
    return NextResponse.json(
      {
        error: appSession.comercialId
          ? "No se encontró tu ficha de comercial activa"
          : "Tu cuenta no tiene un comercial vinculado",
      },
      { status: 403 },
    );
  }

  const property = await prisma.propertyCurrent.findUnique({
    where: { codigo: propertyCode },
  });
  if (!property) {
    return NextResponse.json(
      { error: `Propiedad ${propertyCode} no encontrada` },
      { status: 404 },
    );
  }

  const resolved = await resolveComercialByProperty(propertyCode);
  const comercialRef = comercial.inmovillaRefCode?.trim().toUpperCase() ?? "";
  const propRefExtracted = extractRefCode(property.ref ?? "");
  const refOwner =
    Boolean(comercialRef) &&
    propRefExtracted !== null &&
    propRefExtracted === comercialRef;
  const agenteOwner =
    property.agente?.trim().toLowerCase() ===
    comercial.nombre.trim().toLowerCase();

  const isOwner =
    resolved?.id === comercial.id ||
    property.comercialId === comercial.id ||
    agenteOwner ||
    refOwner;

  if (!isOwner) {
    return NextResponse.json(
      {
        error:
          "Esta propiedad no está asignada a tu usuario comercial en la base de datos",
      },
      { status: 403 },
    );
  }

  if (!comercial.composioConnectionId || !comercial.waId) {
    return NextResponse.json(
      {
        error: `Tu comercial (${comercial.nombre}) necesita WhatsApp y calendario Composio configurados`,
      },
      { status: 400 },
    );
  }

  const demandId = `${TEST_DEMAND_PREFIX}-${Date.now()}`;

  await prisma.demandCurrent.upsert({
    where: { codigo: demandId },
    create: {
      codigo: demandId,
      nombre: "Test Comprador Visitas",
      telefono: TEST_BUYER_WAID,
      presupuestoMin: property.precio * 0.8,
      presupuestoMax: property.precio * 1.2,
      habitacionesMin: property.habitaciones || 1,
      tipos: "Piso",
      zonas: property.zona,
      agente: comercial.nombre,
      lastEventId: "test-seed",
      lastEventPosition: BigInt(0),
      lastEventAt: new Date(),
    },
    update: {},
  });

  startCapture();
  setTestSendInterceptor(captureOutboundRaw);

  try {
    const session = await initiateVisitScheduling(
      demandId,
      propertyCode,
      TEST_BUYER_WAID,
      `test-visit-${Date.now()}`,
    );

    if (!session) {
      discardCapture();
      setTestSendInterceptor(null);
      return NextResponse.json(
        {
          error:
            "No se pudo iniciar la sesión (comercial no encontrado o sin configurar)",
        },
        { status: 400 },
      );
    }

    const newMessages = stopCapture(session.id);

    registerSessionMeta(session.id, {
      buyerWaId: TEST_BUYER_WAID,
      comercialWaId: comercial.waId,
    });

    const updatedSession = await getSessionById(session.id);

    return NextResponse.json({
      session: serializeSession(updatedSession),
      messages: getMessagesForSession(session.id),
      newMessages,
      demandId,
    });
  } catch (err) {
    discardCapture();
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[test-visit-scheduling] Error iniciando sesión:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    setTestSendInterceptor(null);
  }
}

// ---------------------------------------------------------------------------
// DELETE — Cleanup
// ---------------------------------------------------------------------------

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json(
      { error: "Se requiere sessionId" },
      { status: 400 },
    );
  }

  const appSession = await getSessionFromRequest(request);
  if (!appSession) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  try {
    const session = await prisma.visitSchedulingSession.findUnique({
      where: { id: sessionId },
    });

    if (session && !canAccessTestVisitSession(appSession, session.comercialId)) {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
    }

    if (session) {
      await prisma.visitSlotLock.deleteMany({ where: { sessionId } });
      await prisma.propertyVisitSlot.deleteMany({ where: { sessionId } });
      await prisma.visitSchedulingSession.delete({ where: { id: sessionId } });

      if (session.demandId.startsWith(TEST_DEMAND_PREFIX)) {
        await prisma.event.deleteMany({
          where: {
            aggregateId: sessionId,
            aggregateType: "VISIT_SCHEDULING",
          },
        });
        await prisma.demandCurrent
          .delete({ where: { codigo: session.demandId } })
          .catch(() => {});
      }
    }

    clearSession(sessionId);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function serializeSession(session: Record<string, unknown>) {
  return JSON.parse(
    JSON.stringify(session, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  );
}
