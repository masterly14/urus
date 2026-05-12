import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateTemplateBodySchema } from "@/lib/contracts/templates/schema";
import {
  requireTemplateReadAccess,
  requireTemplateWriteAccess,
} from "../_auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireTemplateReadAccess(req);
  if (auth.response) return auth.response;

  const { id } = await params;

  const template = await prisma.contractTemplate.findUnique({
    where: { id },
    include: { createdByUser: { select: { id: true, name: true } } },
  });

  if (!template) {
    return NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 });
  }

  return NextResponse.json(template);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireTemplateWriteAccess(req);
  if (auth.response) return auth.response;

  const { id } = await params;
  const body = await req.json();
  const parsed = updateTemplateBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.contractTemplate.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.structure !== undefined) data.structure = parsed.data.structure as unknown as Record<string, unknown>;
  if (parsed.data.variableBindings !== undefined) data.variableBindings = parsed.data.variableBindings;
  if (parsed.data.sharedClauseOverrides !== undefined) data.sharedClauseOverrides = parsed.data.sharedClauseOverrides;

  const updated = await prisma.contractTemplate.update({
    where: { id },
    data,
  });

  return NextResponse.json({ ok: true, updatedAt: updated.updatedAt });
}
