import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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
