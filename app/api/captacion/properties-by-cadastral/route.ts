import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, unauthorized, forbidden, isCeoOrAdmin } from "@/lib/auth/session";
import {
  buildCadastralRefWarning,
  normalizeCadastralRef,
} from "@/lib/nota-encargo/cadastral-ref";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  if (!isCeoOrAdmin(session.role) && !session.comercialId) {
    return forbidden();
  }

  const { searchParams } = new URL(request.url);
  const refCatastral = normalizeCadastralRef(searchParams.get("refCatastral") ?? "");

  if (!refCatastral) {
    return NextResponse.json(
      { exists: false, error: "Referencia catastral obligatoria" },
      { status: 400 },
    );
  }

  const warnings = [buildCadastralRefWarning(refCatastral)].filter(
    (warning): warning is string => Boolean(warning),
  );

  const property = await prisma.propertyCurrent.findFirst({
    where: {
      refCatastral: { equals: refCatastral, mode: "insensitive" },
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
      refCatastral: true,
    },
  });

  return NextResponse.json({
    exists: Boolean(property),
    preview: property ?? null,
    warnings,
  });
}
