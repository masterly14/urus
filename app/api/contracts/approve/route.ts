import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store/event-store";
import { isAuthorized } from "@/lib/api/cron-auth";

export const runtime = "nodejs";

const RequestSchema = z.object({
  operationId: z.string().min(1),
  propertyCode: z.string().min(1),
  documentKind: z.string().min(1),
  templateVersion: z.string().optional(),
});

function isBrowserRequest(req: Request): boolean {
  return Boolean(req.headers.get("origin") || req.headers.get("referer"));
}

export async function POST(request: Request) {
  if (!isBrowserRequest(request) && process.env.CRON_SECRET && !isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { operationId, propertyCode, documentKind, templateVersion } =
    parsed.data;

  const legalDoc = await prisma.legalDocument.findFirst({
    where: { operationId, documentKind },
  });

  if (!legalDoc) {
    return NextResponse.json(
      { error: `LegalDocument not found for ${operationId}/${documentKind}` },
      { status: 404 },
    );
  }

  if (legalDoc.status !== "DRAFT") {
    return NextResponse.json(
      { error: `Document status is ${legalDoc.status}, expected DRAFT` },
      { status: 409 },
    );
  }

  const now = new Date();

  await prisma.legalDocument.update({
    where: { id: legalDoc.id },
    data: {
      status: "APPROVED",
      approvedAt: now,
    },
  });

  await appendEvent({
    type: "CONTRATO_APROBADO",
    aggregateType: "PROPERTY",
    aggregateId: propertyCode,
    payload: {
      operationId,
      documentKind,
      templateVersion: templateVersion ?? legalDoc.templateVersion,
      legalDocumentId: legalDoc.id,
      approvedAt: now.toISOString(),
    },
  });

  console.log(
    `[contracts/approve] Contrato aprobado: legalDoc=${legalDoc.id} operationId=${operationId}`,
  );

  return NextResponse.json({
    legalDocumentId: legalDoc.id,
    status: "APPROVED",
    approvedAt: now.toISOString(),
  });
}
