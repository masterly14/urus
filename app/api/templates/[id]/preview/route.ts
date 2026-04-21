import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { compileTemplate } from "@/lib/contracts/templates/engine";
import { buildMockPayload } from "@/lib/contracts/templates/mock-payload";
import type { TemplateStructure } from "@/types/contract-template";
import type { ContractDocumentKind } from "@/types/contracts";
import { Packer } from "docx";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const template = await prisma.contractTemplate.findUnique({ where: { id } });
  if (!template) {
    return NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 });
  }

  const structure = template.structure as unknown as TemplateStructure;
  const kind = template.documentKind as ContractDocumentKind;
  const sharedClauseOverrides = template.sharedClauseOverrides as Record<string, string | null> | null;
  const mockInput = buildMockPayload(kind);

  const doc = await compileTemplate(structure, mockInput, { sharedClauseOverrides });
  const buffer = await Packer.toBuffer(doc);
  const base64 = buffer.toString("base64");

  return NextResponse.json({
    ok: true,
    fileName: `preview_${kind}_${template.version}.docx`,
    base64,
  });
}
