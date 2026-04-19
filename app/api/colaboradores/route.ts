import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { listColaboradores, classifyAll } from "@/lib/operacion/colaboradores";
import { withObservedRoute } from "@/lib/observability";


/**
 * GET /api/colaboradores — Lista de colaboradores con stats y clasificacion.
 * Query params: tipo, ciudad, activo, search
 */
const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  const url = new URL(request.url);
  const tipo = url.searchParams.get("tipo") || undefined;
  const ciudad = url.searchParams.get("ciudad") || undefined;
  const activoRaw = url.searchParams.get("activo");
  const activo = activoRaw === "true" ? true : activoRaw === "false" ? false : undefined;
  const search = url.searchParams.get("search") || undefined;

  try {
    const rows = await listColaboradores({ tipo, ciudad, activo, search });
    const classified = classifyAll(rows);

    const tipos = await prisma.colaboradorTipo.findMany({
      where: { activo: true },
      include: { hitos: { orderBy: { orden: "asc" } } },
      orderBy: { orden: "asc" },
    });

    const ciudades = [...new Set(rows.map((r) => r.ciudad).filter(Boolean))].sort();

    return NextResponse.json({
      colaboradores: classified,
      tipos,
      ciudades,
      total: classified.length,
    });
  } catch (error) {
    console.error("[api/colaboradores] GET error:", error);
    return NextResponse.json({ error: "Error al listar colaboradores" }, { status: 500 });
  }
}

export const GET = withObservedRoute({ method: "GET", route: "/api/colaboradores" }, getHandler);

const PostBodySchema = z.object({
  nombre: z.string().trim().min(1),
  tipo: z.string().trim().min(1),
  ciudad: z.string().trim().optional(),
  especialidad: z.string().trim().optional(),
  contactoNombre: z.string().trim().optional(),
  contactoEmail: z.string().trim().optional(),
  contactoTelefono: z.string().trim().optional(),
  notas: z.string().trim().optional(),
});

/**
 * POST /api/colaboradores — Crear colaborador.
 * Si el tipo no existe en colaborador_tipos, lo crea automaticamente.
 */
const postHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
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

  const {
    nombre,
    tipo,
    ciudad = "",
    especialidad = "",
    contactoNombre = "",
    contactoEmail = "",
    contactoTelefono = "",
    notas = "",
  } = parsed.data;

  try {
    await prisma.colaboradorTipo.upsert({
      where: { nombre: tipo },
      create: { nombre: tipo },
      update: {},
    });

    const colaborador = await prisma.colaborador.create({
      data: {
        nombre,
        tipo,
        ciudad,
        especialidad,
        contactoNombre,
        contactoEmail,
        contactoTelefono,
        notas,
      },
    });

    return NextResponse.json({ ok: true, colaborador }, { status: 201 });
  } catch (error) {
    console.error("[api/colaboradores] POST error:", error);
    return NextResponse.json({ error: "Error al crear colaborador" }, { status: 500 });
  }
}

export const POST = withObservedRoute({ method: "POST", route: "/api/colaboradores" }, postHandler);
