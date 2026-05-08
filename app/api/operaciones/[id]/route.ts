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

export const GET = withObservedRoute(
  { method: "GET", route: "/api/operaciones/[id]" },
  getHandler,
);
