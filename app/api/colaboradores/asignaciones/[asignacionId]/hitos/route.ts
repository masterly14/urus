import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";


type Params = { params: Promise<{ asignacionId: string }> };

/**
 * POST /api/colaboradores/asignaciones/:asignacionId/hitos — Crear hito ad-hoc.
 */
const postHandler = async (request: Request, { params }: Params) => {
  const { asignacionId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
  if (!nombre) {
    return NextResponse.json({ error: "Campo obligatorio: nombre" }, { status: 400 });
  }

  const slaDias = typeof body.slaDias === "number" ? body.slaDias : null;

  try {
    const lastHito = await prisma.colaboradorHito.findFirst({
      where: { asignacionId },
      orderBy: { orden: "desc" },
      select: { orden: true },
    });

    const orden = typeof body.orden === "number" ? body.orden : (lastHito?.orden ?? 0) + 1;

    const hito = await prisma.colaboradorHito.create({
      data: {
        asignacionId,
        nombre,
        orden,
        slaDias,
      },
    });

    return NextResponse.json({ ok: true, hito }, { status: 201 });
  } catch (error) {
    console.error("[api/asignaciones/:id/hitos] POST error:", error);
    return NextResponse.json({ error: "Error al crear hito" }, { status: 500 });
  }
}

export const POST = withObservedRoute({ method: "POST", route: "/api/colaboradores/asignaciones/[asignacionId]/hitos" }, postHandler);
