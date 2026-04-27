import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, unauthorized, forbidden, isCeoOrAdmin } from "@/lib/auth/session";
import {
  extractRefCode,
  isValidRefFormat,
  normalizeRef,
} from "@/lib/routing/parse-ref-code";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  if (!isCeoOrAdmin(session.role) && !session.comercialId) {
    return forbidden();
  }

  const { searchParams } = new URL(request.url);
  const rawRef = searchParams.get("ref") ?? "";
  const propertyRef = normalizeRef(rawRef);

  if (!isValidRefFormat(propertyRef)) {
    return NextResponse.json(
      { exists: false, error: "Formato URUS inválido" },
      { status: 400 },
    );
  }

  const warnings: string[] = [];
  const refCode = extractRefCode(propertyRef);
  if (session.comercialId && refCode) {
    const comercial = await prisma.comercial.findUnique({
      where: { id: session.comercialId },
      select: { inmovillaRefCode: true },
    });
    const comercialRefCode = comercial?.inmovillaRefCode?.toUpperCase();
    if (comercialRefCode && comercialRefCode !== refCode) {
      warnings.push(
        `La referencia pertenece al código ${refCode}, distinto del comercial autenticado (${comercialRefCode}).`,
      );
    }
  }

  const property = await prisma.propertyCurrent.findFirst({
    where: {
      ref: { equals: propertyRef, mode: "insensitive" },
      nodisponible: false,
      ...(!isCeoOrAdmin(session.role) && session.comercialId
        ? { comercialId: session.comercialId }
        : {}),
    },
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
  });

  return NextResponse.json({
    exists: Boolean(property),
    preview: property ?? null,
    warnings,
  });
}
