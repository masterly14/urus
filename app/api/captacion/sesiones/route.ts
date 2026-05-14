import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getSession,
  unauthorized,
  forbidden,
  isCeoOrAdmin,
} from "@/lib/auth/session";

export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  if (!isCeoOrAdmin(session.role) && !session.comercialId) {
    return forbidden();
  }

  const where: Record<string, unknown> = {};

  if (!isCeoOrAdmin(session.role) && session.comercialId) {
    where.comercialId = session.comercialId;
  }

  const rows = await prisma.notaEncargoSession.findMany({
    where,
    select: {
      id: true,
      propertyCode: true,
      propertyRef: true,
      refCatastral: true,
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

  const canChooseComercial = isCeoOrAdmin(session.role);

  // Hidratamos el nombre del comercial con una sola query. Evitamos N+1 sin
  // alterar la estructura del modelo (NotaEncargoSession no tiene relación
  // Prisma con Comercial; el join se hace en aplicación).
  const comercialIds = Array.from(
    new Set(rows.map((r) => r.comercialId).filter((id): id is string => Boolean(id))),
  );
  const comerciales = comercialIds.length
    ? await prisma.comercial.findMany({
        where: { id: { in: comercialIds } },
        select: { id: true, nombre: true },
      })
    : [];
  const nameById = new Map(comerciales.map((c) => [c.id, c.nombre]));

  const sesiones = rows.map((r) => ({
    ...r,
    comercialNombre: nameById.get(r.comercialId) ?? null,
  }));

  const assignableComerciales = canChooseComercial
    ? await prisma.comercial.findMany({
        where: { activo: true },
        select: { id: true, nombre: true, ciudad: true },
        orderBy: { nombre: "asc" },
      })
    : [];

  return NextResponse.json({
    sesiones,
    role: session.role,
    currentComercialId: session.comercialId,
    canChooseComercial,
    assignableComerciales,
  });
}
