/**
 * GET /api/market/comerciales
 *
 * Devuelve comerciales asignables para oportunidades de mercado.
 * "Registrado en plataforma" = usuario role=comercial con vinculo a ficha
 * comercial activa.
 */

import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { prisma } from "@/lib/prisma";

const getHandler = async () => {
  const session = await getSession();
  if (!session) return unauthorized();

  const rows = await prisma.user.findMany({
    where: {
      role: "comercial",
      comercialId: { not: null },
      comercial: { is: { activo: true } },
    },
    select: {
      id: true,
      name: true,
      email: true,
      comercial: {
        select: {
          id: true,
          nombre: true,
          ciudad: true,
        },
      },
    },
    orderBy: [{ comercial: { nombre: "asc" } }],
  });

  const items = rows
    .filter((row): row is typeof row & { comercial: NonNullable<typeof row.comercial> } => row.comercial != null)
    .map((row) => ({
      userId: row.id,
      userName: row.name,
      userEmail: row.email,
      comercialId: row.comercial.id,
      comercialNombre: row.comercial.nombre,
      ciudad: row.comercial.ciudad,
    }));

  return NextResponse.json({ ok: true, items });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/market/comerciales" },
  getHandler,
);

export const dynamic = "force-dynamic";
