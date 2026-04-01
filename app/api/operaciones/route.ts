import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/operaciones — Lista de operaciones (para selector de asignacion).
 * Query params: estado, search, limit
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const estado = url.searchParams.get("estado") || undefined;
  const search = url.searchParams.get("search") || undefined;
  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);

  const where: Record<string, unknown> = {};
  if (estado) where.estado = estado;
  if (search) {
    where.OR = [
      { codigo: { contains: search, mode: "insensitive" } },
      { propertyCode: { contains: search, mode: "insensitive" } },
    ];
  }

  try {
    const [operaciones, total] = await Promise.all([
      prisma.operacion.findMany({
        where,
        select: {
          id: true,
          codigo: true,
          propertyCode: true,
          estado: true,
          ciudad: true,
          comercialId: true,
          createdAt: true,
          _count: { select: { asignaciones: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.operacion.count({ where }),
    ]);

    return NextResponse.json({ operaciones, total });
  } catch (error) {
    console.error("[api/operaciones] GET error:", error);
    return NextResponse.json({ error: "Error al listar operaciones" }, { status: 500 });
  }
}
