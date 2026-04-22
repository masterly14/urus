import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";

type Params = { params: Promise<{ id: string }> };

const getHandler = async (request: Request, { params }: Params) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  const { id } = await params;

  const operacion = await prisma.operacion.findUnique({
    where: { id },
    include: {
      asignaciones: {
        select: {
          id: true,
          colaboradorId: true,
          estado: true,
          notas: true,
          createdAt: true,
        },
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

  const documentos = await prisma.legalDocument.findMany({
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
  });

  const eventos = await prisma.event.findMany({
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
  });

  return NextResponse.json({
    operacion: {
      ...operacion,
      documentos,
      eventos,
    },
  });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/operaciones/[id]" },
  getHandler,
);
