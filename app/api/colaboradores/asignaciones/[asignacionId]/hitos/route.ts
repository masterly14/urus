import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";


type Params = { params: Promise<{ asignacionId: string }> };

const PostBodySchema = z.object({
  nombre: z.string().trim().min(1),
  slaDias: z.number().optional(),
  orden: z.number().optional(),
});

/**
 * POST /api/colaboradores/asignaciones/:asignacionId/hitos — Crear hito ad-hoc.
 */
const postHandler = async (request: Request, { params }: Params) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  const { asignacionId } = await params;

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

  const { nombre, slaDias: slaDiasRaw, orden: ordenInput } = parsed.data;
  const slaDias = slaDiasRaw ?? null;

  try {
    const lastHito = await prisma.colaboradorHito.findFirst({
      where: { asignacionId },
      orderBy: { orden: "desc" },
      select: { orden: true },
    });

    const orden = ordenInput ?? (lastHito?.orden ?? 0) + 1;

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
