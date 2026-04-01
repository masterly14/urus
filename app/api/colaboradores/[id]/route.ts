import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getColaboradorDetail } from "@/lib/operacion/colaboradores";
import { classifyColaborador } from "@/lib/operacion/colaboradores/classify";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/colaboradores/:id — Detalle con asignaciones, hitos, docs y clasificacion.
 */
export async function GET(_request: Request, { params }: Params) {
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

/**
 * PATCH /api/colaboradores/:id — Actualizar campos del colaborador.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  const stringFields = [
    "nombre", "tipo", "ciudad", "especialidad",
    "contactoNombre", "contactoEmail", "contactoTelefono", "notas",
  ] as const;
  for (const field of stringFields) {
    if (typeof body[field] === "string") {
      data[field] = (body[field] as string).trim();
    }
  }
  if (typeof body.activo === "boolean") {
    data.activo = body.activo;
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

    return NextResponse.json({ ok: true, colaborador });
  } catch (error) {
    console.error("[api/colaboradores/:id] PATCH error:", error);
    return NextResponse.json({ error: "Error al actualizar colaborador" }, { status: 500 });
  }
}

/**
 * DELETE /api/colaboradores/:id — Soft delete (activo = false).
 */
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;

  try {
    await prisma.colaborador.update({
      where: { id },
      data: { activo: false },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/colaboradores/:id] DELETE error:", error);
    return NextResponse.json({ error: "Error al desactivar colaborador" }, { status: 500 });
  }
}
