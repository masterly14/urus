import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { appendEvent } from "@/lib/event-store";
import type { JsonValue } from "@/lib/event-store/types";
import { generarCodigoOperacion } from "@/lib/operacion/codigo";
import { isTerminal } from "@/lib/operacion/stages";
import type { OperacionEstado, Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// GET /api/operaciones
// ---------------------------------------------------------------------------

const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const estado = url.searchParams.get("estado") || undefined;
  const search = url.searchParams.get("search") || undefined;
  const comercialId = url.searchParams.get("comercialId") || undefined;
  const ciudad = url.searchParams.get("ciudad") || undefined;
  const closedAfter = url.searchParams.get("closedAfter") || undefined;
  const closedBefore = url.searchParams.get("closedBefore") || undefined;
  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
  const orderBy = url.searchParams.get("orderBy") || "createdAt";
  const orderDir = url.searchParams.get("orderDir") === "asc" ? "asc" : "desc";

  const where: Prisma.OperacionWhereInput = {};
  if (estado) where.estado = estado as OperacionEstado;
  if (comercialId) where.comercialId = comercialId;
  if (ciudad) where.ciudad = { contains: ciudad, mode: "insensitive" };
  if (closedAfter || closedBefore) {
    where.closedAt = {};
    if (closedAfter) (where.closedAt as Record<string, Date>).gte = new Date(closedAfter);
    if (closedBefore) (where.closedAt as Record<string, Date>).lte = new Date(closedBefore);
  }
  if (search) {
    where.OR = [
      { codigo: { contains: search, mode: "insensitive" } },
      { propertyCode: { contains: search, mode: "insensitive" } },
    ];
  }

  const validOrderFields = new Set(["createdAt", "updatedAt", "closedAt", "codigo", "estado"]);
  const sortField = validOrderFields.has(orderBy) ? orderBy : "createdAt";

  try {
    const [operacionesRaw, total] = await Promise.all([
      prisma.operacion.findMany({
        where,
        select: {
          id: true,
          codigo: true,
          propertyCode: true,
          estado: true,
          ciudad: true,
          comercialId: true,
          demandId: true,
          buyerClientId: true,
          closedAt: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { asignaciones: true } },
        },
        orderBy: { [sortField]: orderDir },
        take: limit,
        skip: offset,
      }),
      prisma.operacion.count({ where }),
    ]);

    const propertyCodes = [...new Set(operacionesRaw.map(op => op.propertyCode))];
    const properties = await prisma.propertyCurrent.findMany({
      where: { codigo: { in: propertyCodes } },
      select: { codigo: true, mainPhotoUrl: true, ref: true, numFotos: true }
    });
    
    const propertyMap = new Map(properties.map(p => [p.codigo, p]));

    const operaciones = operacionesRaw.map(op => ({
      ...op,
      property: propertyMap.get(op.propertyCode) || null
    }));

    return NextResponse.json({ operaciones, total });
  } catch (error) {
    console.error("[api/operaciones] GET error:", error);
    return NextResponse.json({ error: "Error al listar operaciones" }, { status: 500 });
  }
};

// ---------------------------------------------------------------------------
// POST /api/operaciones
// ---------------------------------------------------------------------------

const CreateOperacionSchema = z.object({
  propertyCode: z.string().trim().min(1, "propertyCode es obligatorio"),
  demandId: z.string().trim().min(1).optional(),
  buyerClientId: z.string().trim().min(1).optional(),
  sellerClientId: z.string().trim().min(1).optional(),
  comercialId: z.string().trim().min(1).optional(),
  ciudad: z.string().trim().optional(),
});

const postHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const body = await request.json().catch(() => null);
  const parsed = CreateOperacionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { propertyCode, demandId, buyerClientId, sellerClientId, ciudad } = parsed.data;
  const comercialId = parsed.data.comercialId ?? session.comercialId ?? undefined;

  const existingActive = await prisma.operacion.findFirst({
    where: {
      propertyCode,
      estado: { notIn: ["CERRADA_VENTA", "CERRADA_ALQUILER", "CERRADA_TRASPASO", "CANCELADA"] },
    },
    select: { id: true, codigo: true, estado: true },
  });

  if (existingActive) {
    return NextResponse.json(
      {
        error: `Ya existe una operación activa para esta propiedad: ${existingActive.codigo} (${existingActive.estado})`,
      },
      { status: 409 },
    );
  }

  try {
    const codigo = await generarCodigoOperacion();

    const operacion = await prisma.operacion.create({
      data: {
        codigo,
        propertyCode,
        estado: "EN_CURSO",
        demandId: demandId ?? null,
        buyerClientId: buyerClientId ?? null,
        sellerClientId: sellerClientId ?? null,
        comercialId: comercialId ?? null,
        ciudad: ciudad ?? "",
      },
    });

    await appendEvent({
      type: "OPERACION_CREADA",
      aggregateType: "OPERACION",
      aggregateId: propertyCode,
      payload: {
        operacionId: operacion.id,
        operacionCodigo: operacion.codigo,
        propertyCode,
        demandId: operacion.demandId,
        buyerClientId: operacion.buyerClientId,
        sellerClientId: operacion.sellerClientId,
        comercialId: operacion.comercialId,
        createdByUserId: session.userId,
      } as unknown as JsonValue,
    });

    console.log(
      `[api/operaciones] POST — creada ${operacion.codigo} para propiedad=${propertyCode} por userId=${session.userId}`,
    );

    return NextResponse.json({ operacion }, { status: 201 });
  } catch (error) {
    console.error("[api/operaciones] POST error:", error);
    return NextResponse.json({ error: "Error al crear operación" }, { status: 500 });
  }
};

export const GET = withObservedRoute({ method: "GET", route: "/api/operaciones" }, getHandler);
export const POST = withObservedRoute({ method: "POST", route: "/api/operaciones" }, postHandler);
