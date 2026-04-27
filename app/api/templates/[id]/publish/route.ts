import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateTemplateForPublishing } from "@/lib/contracts/templates/validate-bindings";
import { requireTemplateWriteAccess } from "../_auth";
import type { TemplateStructure } from "@/types/contract-template";
import type { ContractDocumentKind } from "@/types/contracts";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireTemplateWriteAccess(req);
  if (auth.response) return auth.response;

  const { id } = await params;

  const template = await prisma.contractTemplate.findUnique({ where: { id } });
  if (!template) {
    return NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 });
  }

  const structure = template.structure as unknown as TemplateStructure;
  const kind = template.documentKind as ContractDocumentKind;
  const issues = validateTemplateForPublishing(structure, kind);

  if (issues.length > 0) {
    return NextResponse.json({ error: "Validacion fallida", issues }, { status: 422 });
  }

  const previousActive = await prisma.contractTemplate.findFirst({
    where: { documentKind: template.documentKind, isActive: true },
    select: { id: true, version: true },
  });

  await prisma.$transaction([
    prisma.contractTemplate.updateMany({
      where: { documentKind: template.documentKind, isActive: true },
      data: { isActive: false },
    }),
    prisma.contractTemplate.update({
      where: { id },
      data: { isActive: true, publishedAt: new Date() },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    previousActiveVersion: previousActive?.version ?? null,
  });
}
