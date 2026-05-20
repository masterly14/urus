import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { appendEvent } from "@/lib/event-store";
import type { JsonValue } from "@/lib/event-store/types";
import { Prisma } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

const getHandler = async (request: Request, { params }: Params) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  const { id } = await params;

  const operacion = await prisma.operacion.findUnique({
    where: { id },
    include: {
      asignaciones: {
        include: {
          colaborador: {
            select: { id: true, nombre: true, tipo: true },
          },
          hitos: {
            orderBy: { orden: "asc" },
          },
          documentos: true,
        },
        orderBy: { createdAt: "desc" },
      },
      _count: {
        select: {
          notas: true,
          checklistItems: true,
          adjuntos: true,
        },
      },
    },
  });

  if (!operacion) {
    return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 });
  }

  const [documentos, eventos, property, demand, comercial] = await Promise.all([
    prisma.legalDocument.findMany({
      where: { operationId: operacion.codigo },
      select: {
        id: true,
        documentKind: true,
        status: true,
        templateVersion: true,
        cloudinaryUrl: true,
        signedDocumentUrl: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.event.findMany({
      where: {
        aggregateType: "OPERACION",
        aggregateId: operacion.propertyCode,
      },
      select: {
        id: true,
        type: true,
        payload: true,
        occurredAt: true,
      },
      orderBy: { occurredAt: "desc" },
      take: 50,
    }),
    prisma.propertyCurrent.findUnique({
      where: { codigo: operacion.propertyCode },
      select: {
        codigo: true,
        ref: true,
        titulo: true,
        tipoOfer: true,
        precio: true,
        metrosConstruidos: true,
        habitaciones: true,
        banyos: true,
        ciudad: true,
        zona: true,
        estado: true,
        numFotos: true,
        mainPhotoUrl: true,
        portalUrl: true,
        portalName: true,
        propietarioNombre: true,
        propietarioDni: true,
        propietarioPhone: true,
        propietarioDomicilioFiscal: true,
      },
    }),
    operacion.demandId
      ? prisma.demandCurrent.findUnique({
          where: { codigo: operacion.demandId },
          select: {
            codigo: true,
            ref: true,
            nombre: true,
            estadoNombre: true,
            presupuestoMin: true,
            presupuestoMax: true,
            habitacionesMin: true,
            tipos: true,
            zonas: true,
            telefono: true,
            leadStatus: true,
            metrosMin: true,
            metrosMax: true,
            tipoOperacion: true,
          },
        })
      : Promise.resolve(null),
    operacion.comercialId
      ? prisma.comercial.findUnique({
          where: { id: operacion.comercialId },
          select: {
            id: true,
            nombre: true,
            telefono: true,
            email: true,
            ciudad: true,
          },
        })
      : Promise.resolve(null),
  ]);

  return NextResponse.json({
    operacion: {
      ...operacion,
      property,
      demand,
      comercial,
      documentos,
      eventos,
    },
  });
};

const deleteHandler = async (request: Request, { params }: Params) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  const { id } = await params;

  const operacion = await prisma.operacion.findUnique({
    where: { id },
    select: {
      id: true,
      codigo: true,
      propertyCode: true,
      estado: true,
    },
  });

  if (!operacion) {
    return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 });
  }

  if (operacion.estado.startsWith("CERRADA_")) {
    return NextResponse.json(
      { error: "No se puede eliminar una operación cerrada" },
      { status: 409 },
    );
  }

  const [legalDocsCount, signatureRequestsCount] = await Promise.all([
    prisma.legalDocument.count({ where: { operationId: operacion.codigo } }),
    prisma.signatureRequest.count({ where: { operationId: operacion.codigo } }),
  ]);

  if (legalDocsCount > 0 || signatureRequestsCount > 0) {
    return NextResponse.json(
      {
        error:
          "No se puede eliminar una operación con documentos legales o solicitudes de firma asociadas",
      },
      { status: 409 },
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.colaboradorAsignacion.deleteMany({
        where: { operacionId: operacion.id },
      });
      await tx.operacion.delete({ where: { id: operacion.id } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return NextResponse.json(
        {
          error:
            "No se puede eliminar la operación porque tiene relaciones activas. Revisa colaboradores y datos asociados.",
        },
        { status: 409 },
      );
    }
    throw error;
  }

  try {
    await appendEvent({
      type: "OPERACION_ELIMINADA",
      aggregateType: "OPERACION",
      aggregateId: operacion.propertyCode,
      payload: {
        operacionId: operacion.id,
        operacionCodigo: operacion.codigo,
        propertyCode: operacion.propertyCode,
        previousEstado: operacion.estado,
        deletedByUserId: session.userId,
        deletedAt: new Date().toISOString(),
        source: "manual_delete",
      } as unknown as JsonValue,
    });
  } catch (error) {
    console.error("[api/operaciones/[id]] DELETE event append error:", error);
  }

  return NextResponse.json({ ok: true });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/operaciones/[id]" },
  getHandler,
);
export const DELETE = withObservedRoute(
  { method: "DELETE", route: "/api/operaciones/[id]" },
  deleteHandler,
);
