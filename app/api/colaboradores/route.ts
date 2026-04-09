import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listColaboradores, classifyAll } from "@/lib/operacion/colaboradores";
import { withObservedRoute } from "@/lib/observability";


/**
 * GET /api/colaboradores — Lista de colaboradores con stats y clasificacion.
 * Query params: tipo, ciudad, activo, search
 */
const getHandler = async (request: Request) => {
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

/**
 * POST /api/colaboradores — Crear colaborador.
 * Si el tipo no existe en colaborador_tipos, lo crea automaticamente.
 */
const postHandler = async (request: Request) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
  const tipo = typeof body.tipo === "string" ? body.tipo.trim() : "";
  const ciudad = typeof body.ciudad === "string" ? body.ciudad.trim() : "";
  const especialidad = typeof body.especialidad === "string" ? body.especialidad.trim() : "";
  const contactoNombre = typeof body.contactoNombre === "string" ? body.contactoNombre.trim() : "";
  const contactoEmail = typeof body.contactoEmail === "string" ? body.contactoEmail.trim() : "";
  const contactoTelefono = typeof body.contactoTelefono === "string" ? body.contactoTelefono.trim() : "";
  const notas = typeof body.notas === "string" ? body.notas.trim() : "";

  if (!nombre || !tipo) {
    return NextResponse.json(
      { error: "Campos obligatorios: nombre, tipo" },
      { status: 400 },
    );
  }

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
