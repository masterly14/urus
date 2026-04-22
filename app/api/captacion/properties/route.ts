import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, unauthorized, forbidden, isCeoOrAdmin } from "@/lib/auth/session";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  if (!isCeoOrAdmin(session.role) && !session.comercialId) {
    return forbidden();
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const where: Record<string, unknown> = {
    nodisponible: false,
  };

  if (q.length >= 2) {
    where.OR = [
      { ref: { contains: q, mode: "insensitive" } },
      { titulo: { contains: q, mode: "insensitive" } },
      { ciudad: { contains: q, mode: "insensitive" } },
      { zona: { contains: q, mode: "insensitive" } },
    ];
  }

  if (!isCeoOrAdmin(session.role) && session.comercialId) {
    where.comercialId = session.comercialId;
  }

  const properties = await prisma.propertyCurrent.findMany({
    where,
    select: {
      codigo: true,
      ref: true,
      titulo: true,
      mainPhotoUrl: true,
      ciudad: true,
      zona: true,
      precio: true,
      tipoOfer: true,
      habitaciones: true,
      banyos: true,
      metrosConstruidos: true,
    },
    orderBy: { updatedAt: "desc" },
    take: q.length >= 2 ? 50 : 200,
  });

  return NextResponse.json({ properties });
}
