import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";


type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/colaboradores/:id/asignaciones — Asignaciones del colaborador.
 */
const getHandler = async (request: Request, { params }: Params) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  const { id } = await params;

  try {
    const asignaciones = await prisma.colaboradorAsignacion.findMany({
      where: { colaboradorId: id },
      include: {
        operacion: { select: { id: true, codigo: true, propertyCode: true, estado: true } },
        hitos: { orderBy: { orden: "asc" }, include: { documentos: true } },
        documentos: true,
      },
      orderBy: { assignedAt: "desc" },
    });

    return NextResponse.json({ asignaciones });
  } catch (error) {
    console.error("[api/colaboradores/:id/asignaciones] GET error:", error);
    return NextResponse.json({ error: "Error al listar asignaciones" }, { status: 500 });
  }
}

export const GET = withObservedRoute({ method: "GET", route: "/api/colaboradores/[id]/asignaciones" }, getHandler);

const HitoInputSchema = z.object({
  nombre: z.string().trim().min(1),
  orden: z.number().optional(),
  slaDias: z.number().optional(),
});

const PostBodySchema = z.object({
  operacionId: z.string().trim().min(1),
  notas: z.string().trim().optional(),
  hitos: z.array(HitoInputSchema).optional(),
});

/**
 * POST /api/colaboradores/:id/asignaciones — Asignar colaborador a operacion.
 * Body: { operacionId, notas?, hitos?: Array<{nombre, orden, slaDias?}> }
 * Si no se pasan hitos, se crean desde las plantillas del tipo del colaborador.
 */
const postHandler = async (request: Request, { params }: Params) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Input inválido", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { operacionId, notas = "", hitos: hitosInput } = parsed.data;

  try {
    const existing = await prisma.colaboradorAsignacion.findUnique({
      where: { colaboradorId_operacionId: { colaboradorId: id, operacionId } },
    });
    if (existing) {
      return NextResponse.json(
        { error: "El colaborador ya está asignado a esta operación" },
        { status: 409 },
      );
    }

    const colaborador = await prisma.colaborador.findUnique({
      where: { id },
      select: { tipo: true },
    });
    if (!colaborador) {
      return NextResponse.json({ error: "Colaborador no encontrado" }, { status: 404 });
    }

    let hitosToCreate: { nombre: string; orden: number; slaDias: number | null; hitoPlantillaId: string | null }[] = [];

    if (hitosInput && hitosInput.length > 0) {
      hitosToCreate = hitosInput.map((h, i: number) => ({
        nombre: h.nombre,
        orden: h.orden ?? i + 1,
        slaDias: h.slaDias ?? null,
        hitoPlantillaId: null,
      }));
    } else {
      const tipoRecord = await prisma.colaboradorTipo.findUnique({
        where: { nombre: colaborador.tipo },
        include: { hitos: { orderBy: { orden: "asc" } } },
      });

      if (tipoRecord && tipoRecord.hitos.length > 0) {
        hitosToCreate = tipoRecord.hitos.map((hp) => ({
          nombre: hp.nombre,
          orden: hp.orden,
          slaDias: null,
          hitoPlantillaId: hp.id,
        }));
      }
    }

    const slaConfigs = await prisma.colaboradorSlaConfig.findMany({
      where: { colaboradorId: id },
    });
    const slaMap = new Map(
      slaConfigs.map((s) => [s.hitoPlantillaId ?? "__global__", s.slaDias]),
    );
    const globalSla = slaMap.get("__global__") ?? null;

    const asignacion = await prisma.colaboradorAsignacion.create({
      data: {
        colaboradorId: id,
        operacionId,
        notas,
        estado: "PENDIENTE",
        hitos: {
          create: hitosToCreate.map((h) => {
            const slaDias = h.slaDias ?? slaMap.get(h.hitoPlantillaId ?? "") ?? globalSla;
            return {
              nombre: h.nombre,
              orden: h.orden,
              slaDias,
              hitoPlantillaId: h.hitoPlantillaId,
            };
          }),
        },
      },
      include: {
        hitos: { orderBy: { orden: "asc" } },
        operacion: { select: { codigo: true } },
      },
    });

    return NextResponse.json({ ok: true, asignacion }, { status: 201 });
  } catch (error) {
    console.error("[api/colaboradores/:id/asignaciones] POST error:", error);
    return NextResponse.json({ error: "Error al crear asignación" }, { status: 500 });
  }
}

export const POST = withObservedRoute({ method: "POST", route: "/api/colaboradores/[id]/asignaciones" }, postHandler);
