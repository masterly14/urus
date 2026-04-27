import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTemplateReadAccess } from "../../_auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireTemplateReadAccess(req);
  if (auth.response) return auth.response;

  const { id } = await params;

  const template = await prisma.contractTemplate.findUnique({
    where: { id },
    select: { documentKind: true },
  });

  if (!template) {
    return NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 });
  }

  const versions = await prisma.contractTemplate.findMany({
    where: { documentKind: template.documentKind },
    select: {
      id: true,
      version: true,
      name: true,
      isActive: true,
      publishedAt: true,
      createdAt: true,
      createdByUser: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(versions);
}
