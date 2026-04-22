import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getColaboradorDetail } from "@/lib/operacion/colaboradores";
import { classifyColaborador } from "@/lib/operacion/colaboradores/classify";
import { withObservedRoute } from "@/lib/observability";


type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/colaboradores/:id — Detalle con asignaciones, hitos, docs y clasificacion.
 */
const getHandler = async (request: Request, { params }: Params) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  const { id } = await params;

  try {
    const detail = await getColaboradorDetail(id);
    if (!detail) {
      return NextResponse.json({ error: "Colaborador no encontrado" }, { status: 404 });
    }

    const clasificacion = classifyColaborador(detail, detail.asignacionesTotales);

    return NextResponse.json({ ...detail, clasificacion });
  } catch (error) {
    console.error("[api/colaboradores/:id] GET error:", error);
    return NextResponse.json({ error: "Error al obtener colaborador" }, { status: 500 });
  }
}

export const GET = withObservedRoute({ method: "GET", route: "/api/colaboradores/[id]" }, getHandler);

const PatchBodySchema = z.object({
  nombre: z.string().trim().optional(),
  tipo: z.string().trim().optional(),
  ciudad: z.string().trim().optional(),
  especialidad: z.string().trim().optional(),
  contactoNombre: z.string().trim().optional(),
  contactoEmail: z.string().trim().optional(),
  contactoTelefono: z.string().trim().optional(),
  notas: z.string().trim().optional(),
  activo: z.boolean().optional(),
});

/**
 * PATCH /api/colaboradores/:id — Actualizar campos del colaborador.
 */
const patchHandler = async (request: Request, { params }: Params) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const parsed = PatchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Input inválido", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const data: Record<string, unknown> = {};
  const stringFields = [
    "nombre", "tipo", "ciudad", "especialidad",
    "contactoNombre", "contactoEmail", "contactoTelefono", "notas",
  ] as const;
  for (const field of stringFields) {
    const v = parsed.data[field];
    if (v !== undefined) {
      data[field] = v;
    }
  }
  if (parsed.data.activo !== undefined) {
    data.activo = parsed.data.activo;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  try {
    if (typeof data.tipo === "string") {
      await prisma.colaboradorTipo.upsert({
        where: { nombre: data.tipo as string },
        create: { nombre: data.tipo as string },
        update: {},
      });
    }

    const colaborador = await prisma.colaborador.update({
      where: { id },
      data,
    });

    revalidateTag("colaboradores-dashboard", { expire: 0 });

    return NextResponse.json({ ok: true, colaborador });
  } catch (error) {
    console.error("[api/colaboradores/:id] PATCH error:", error);
    return NextResponse.json({ error: "Error al actualizar colaborador" }, { status: 500 });
  }
}

export const PATCH = withObservedRoute({ method: "PATCH", route: "/api/colaboradores/[id]" }, patchHandler);

/**
 * DELETE /api/colaboradores/:id — Soft delete (activo = false).
 */
const deleteHandler = async (request: Request, { params }: Params) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  const { id } = await params;

  try {
    await prisma.colaborador.update({
      where: { id },
      data: { activo: false },
    });

    revalidateTag("colaboradores-dashboard", { expire: 0 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/colaboradores/:id] DELETE error:", error);
    return NextResponse.json({ error: "Error al desactivar colaborador" }, { status: 500 });
  }
}

export const DELETE = withObservedRoute({ method: "DELETE", route: "/api/colaboradores/[id]" }, deleteHandler);
