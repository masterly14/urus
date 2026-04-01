import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const comerciales = await prisma.comercial.findMany({
      where: { activo: true },
      select: { id: true, nombre: true, ciudad: true },
      orderBy: { nombre: "asc" },
    });

    return NextResponse.json({ ok: true, comerciales });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/comerciales/activos] Error:", message);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
