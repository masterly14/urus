import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createTemplateBodySchema } from "@/lib/contracts/templates/schema";
import { randomUUID } from "node:crypto";
import type { TemplateStructure } from "@/types/contract-template";

const createId = () => randomUUID().replace(/-/g, "").slice(0, 25);

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const kind = searchParams.get("kind");
  const active = searchParams.get("active");

  const where: Record<string, unknown> = {};
  if (kind) where.documentKind = kind;
  if (active === "true") where.isActive = true;
  if (active === "false") where.isActive = false;

  const templates = await prisma.contractTemplate.findMany({
    where,
    select: {
      id: true,
      documentKind: true,
      version: true,
      name: true,
      isActive: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
      createdByUser: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = createTemplateBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { documentKind, name, version, cloneFromId } = parsed.data;
  const resolvedVersion = version ?? `${new Date().toISOString().slice(0, 7).replace("-", ".")}-v${Date.now() % 1000}`;

  let structure: TemplateStructure;
  let variableBindings: unknown[] = [];
  let sharedClauseOverrides: Record<string, unknown> = {};

  if (cloneFromId) {
    const source = await prisma.contractTemplate.findUnique({ where: { id: cloneFromId } });
    if (!source) {
      return NextResponse.json({ error: "Plantilla origen no encontrada" }, { status: 404 });
    }
    structure = source.structure as unknown as TemplateStructure;
    variableBindings = source.variableBindings as unknown[] ?? [];
    sharedClauseOverrides = source.sharedClauseOverrides as Record<string, unknown> ?? {};

    const clonedBlocks = structure.blocks.map((b) => ({ ...b, id: createId() }));
    structure = { blocks: clonedBlocks };
  } else {
    structure = {
      blocks: [
        { id: createId(), type: "logo_header", content: "", config: { type: "logo_header" } },
        { id: createId(), type: "title", content: "TITULO DEL DOCUMENTO", config: { type: "title" } },
        { id: createId(), type: "heading", content: "SECCION", config: { type: "heading" } },
        { id: createId(), type: "body_paragraph", content: "", config: { type: "body_paragraph" } },
        { id: createId(), type: "additional_clauses_slot", content: "", config: { type: "additional_clauses_slot" } },
        { id: createId(), type: "signature_block", content: "", config: { type: "signature_block", labels: ["PARTE A", "PARTE B"] } },
      ],
    };
  }

  const template = await prisma.contractTemplate.create({
    data: {
      documentKind,
      version: resolvedVersion,
      name,
      isActive: false,
      structure: structure as unknown as Prisma.InputJsonValue,
      variableBindings: variableBindings as unknown as Prisma.InputJsonValue,
      sharedClauseOverrides: sharedClauseOverrides as unknown as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json(template, { status: 201 });
}
