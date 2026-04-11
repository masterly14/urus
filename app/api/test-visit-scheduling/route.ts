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
      const session = await prisma.visitSchedulingSession.findUnique({
        where: { id: sessionId },
      });
      if (!session) {
        return NextResponse.json(
          { error: "Sesión no encontrada" },
          { status: 404 },
        );
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

  const comercial = await prisma.comercial.findFirst({
    where: {
      composioConnectionId: { not: null },
      activo: true,
    },
    select: {
      id: true,
      nombre: true,
      waId: true,
      composioConnectionId: true,
      composioConnectedAt: true,
    },
  });

  if (!comercial) {
    return NextResponse.json({
      properties: [],
      comercial: null,
      error: "No hay comercial con conexión Composio activa",
    });
  }

  const properties = await prisma.propertyCurrent.findMany({
    where: { agente: comercial.nombre, nodisponible: false },
    select: {
      codigo: true,
      ref: true,
      titulo: true,
      ciudad: true,
      zona: true,
      precio: true,
      habitaciones: true,
      metrosConstruidos: true,
      agente: true,
    },
    take: 50,
    orderBy: { codigo: "asc" },
  });

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
  const body = await request.json();
  const propertyCode = body.propertyCode as string;

  if (!propertyCode) {
    return NextResponse.json(
      { error: "Se requiere propertyCode" },
      { status: 400 },
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

  const comercial = await prisma.comercial.findFirst({
    where: { nombre: property.agente, activo: true },
  });
  if (!comercial?.composioConnectionId || !comercial.waId) {
    return NextResponse.json(
      {
        error: `Comercial ${property.agente} sin Composio/WhatsApp configurado`,
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
      agente: property.agente,
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

  try {
    const session = await prisma.visitSchedulingSession.findUnique({
      where: { id: sessionId },
    });

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
