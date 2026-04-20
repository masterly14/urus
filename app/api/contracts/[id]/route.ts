import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { normalizeSmartClosingContractDetail } from "@/lib/legal/smart-closing/contracts-api";
import { withObservedRoute } from "@/lib/observability";
import { appendEvent } from "@/lib/event-store/event-store";
import { additionalClausesDocSchema } from "@/lib/contracts/additional-clauses/schema";
import { isAdditionalClausesDocEmpty } from "@/lib/contracts/additional-clauses/types";

type RouteParams = { params: Promise<{ id: string }> };

const getHandler = async (request: Request, { params }: RouteParams) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

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

/**
 * PATCH /api/contracts/[id]
 * ---------------------------------------------------------------------------
 * Actualiza las cláusulas adicionales libres del contrato (editor WYSIWYG).
 *
 * Reglas operativas:
 * - Solo editable mientras `status === "DRAFT"`. Cualquier otro estado
 *   (APPROVED, SENT_TO_SIGNATURE, SIGNED, …) devuelve 409: la cadena de
 *   custodia del documento firmable no debe mutarse después de aprobar.
 * - El JSON llega validado contra `additionalClausesDocSchema` (subset
 *   controlado TipTap: paragraph, bold, italic, fontSize S/M/L, listas).
 * - Se emite `CONTRATO_CLAUSULAS_ADICIONALES_EDITADAS` en el event store
 *   para trazabilidad (misma convención que `CONTRATO_APROBADO`).
 * - Si el payload está vacío se borra el valor persistido (nulifica la
 *   columna) y la próxima generación docx omite la sección.
 */

const PatchBodySchema = z.object({
  additionalClausesDoc: additionalClausesDocSchema.nullable(),
});

const patchHandler = async (request: Request, { params }: RouteParams) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const { id } = await params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = PatchBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Cuerpo inválido", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const legalDocument = await prisma.legalDocument.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      operationId: true,
      propertyCode: true,
      documentKind: true,
      templateVersion: true,
    },
  });

  if (!legalDocument) {
    return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });
  }

  if (legalDocument.status !== "DRAFT") {
    return NextResponse.json(
      {
        error: `No se pueden editar cláusulas adicionales con el documento en estado ${legalDocument.status}. Solo se permite mientras esté en DRAFT.`,
      },
      { status: 409 },
    );
  }

  const incomingDoc = parsed.data.additionalClausesDoc;
  const shouldClear = incomingDoc == null || isAdditionalClausesDocEmpty(incomingDoc);
  const now = new Date();

  const updated = await prisma.legalDocument.update({
    where: { id },
    data: {
      additionalClausesDoc: shouldClear
        ? Prisma.JsonNull
        : (incomingDoc as unknown as Prisma.InputJsonValue),
      additionalClausesUpdatedAt: shouldClear ? null : now,
    },
    select: { additionalClausesUpdatedAt: true },
  });

  await appendEvent({
    type: "CONTRATO_CLAUSULAS_ADICIONALES_EDITADAS",
    aggregateType: "PROPERTY",
    aggregateId: legalDocument.propertyCode,
    payload: {
      legalDocumentId: legalDocument.id,
      operationId: legalDocument.operationId,
      documentKind: legalDocument.documentKind,
      templateVersion: legalDocument.templateVersion,
      cleared: shouldClear,
      editedAt: now.toISOString(),
    },
  });

  return NextResponse.json({
    ok: true,
    additionalClausesUpdatedAt: updated.additionalClausesUpdatedAt
      ? updated.additionalClausesUpdatedAt.toISOString()
      : null,
  });
};

export const PATCH = withObservedRoute(
  { method: "PATCH", route: "/api/contracts/[id]" },
  patchHandler,
);
