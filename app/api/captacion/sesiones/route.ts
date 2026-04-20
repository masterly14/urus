import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, unauthorized, isCeoOrAdmin } from "@/lib/auth/session";

export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  const where: Record<string, unknown> = {};

  if (!isCeoOrAdmin(session.role) && session.comercialId) {
    where.comercialId = session.comercialId;
  }

  const sesiones = await prisma.notaEncargoSession.findMany({
    where,
    select: {
      id: true,
      propertyCode: true,
      propertyRef: true,
      direccion: true,
      propietarioPhone: true,
      visitDateTime: true,
      state: true,
      tipoOperacion: true,
      precio: true,
      comercialId: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ sesiones });
}
