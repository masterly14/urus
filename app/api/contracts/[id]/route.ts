import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeSmartClosingContractDetail } from "@/lib/legal/smart-closing/contracts-api";
import { withObservedRoute } from "@/lib/observability";

type RouteParams = { params: Promise<{ id: string }> };

const getHandler = async (_request: Request, { params }: RouteParams) => {
  const { id } = await params;

  const legalDocument = await prisma.legalDocument.findUnique({
    where: { id },
    include: {
      parties: {
        select: {
          role: true,
          fullName: true,
          email: true,
          phone: true,
        },
      },
    },
  });

  if (!legalDocument) {
    return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });
  }

  try {
    return NextResponse.json(normalizeSmartClosingContractDetail(legalDocument));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Contrato inválido";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}

export const GET = withObservedRoute({ method: "GET", route: "/api/contracts/[id]" }, getHandler);
