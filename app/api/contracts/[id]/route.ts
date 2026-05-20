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
import {
  contractTemplateInputSchema,
  type ContractTemplateInput,
} from "@/lib/legal/smart-closing/contracts-api";
import { sectionAddendumsListSchema } from "@/lib/contracts/section-addendums/schema";
import {
  isSectionAddendumsListEmpty,
  type SectionAddendumsList,
} from "@/lib/contracts/section-addendums/types";
import { isValidSectionIdForKind } from "@/lib/contracts/section-addendums/catalog";
import { validateContractTemplateInput } from "@/lib/contracts/docx/validators";

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
 * Actualiza extensiones libres del contrato (todas opcionales en el body):
 *  - `additionalClausesDoc`: cláusulas adicionales libres al final del
 *     contrato (editor WYSIWYG TipTap, subset controlado).
 *  - `sectionAddendums`: detalles añadidos por el comercial dentro de
 *     secciones concretas (ej. ampliar "INMUEBLE" con datos registrales
 *     adicionales, anejos o cargas conocidas). Estructurado: cada
 *     addendum lleva sectionId del catálogo, type semántico y
 *     contentDoc en el mismo subset TipTap.
 *
 * Reglas operativas:
 * - Solo editable mientras `status === "DRAFT"`. Cualquier otro estado
 *   (APPROVED, SENT_TO_SIGNATURE, SIGNED, …) devuelve 409: la cadena de
 *   custodia del documento firmable no debe mutarse después de aprobar.
 * - `sectionAddendums[i].sectionId` debe pertenecer al catálogo de
 *   secciones del `documentKind` del contrato. Si no, 422.
 * - Se emite `CONTRATO_CLAUSULAS_ADICIONALES_EDITADAS` o
 *   `CONTRATO_SECCION_AMPLIADA` en el event store para trazabilidad
 *   (uno u otro según qué se haya editado).
 * - Si un campo viene vacío se borra el valor persistido (nulifica la
 *   columna correspondiente).
 */

const PatchBodySchema = z
  .object({
    additionalClausesDoc: additionalClausesDocSchema.nullable().optional(),
    sectionAddendums: sectionAddendumsListSchema.nullable().optional(),
    contractTemplateInput: contractTemplateInputSchema.optional(),
    payloadEdit: z
      .object({
        fieldPath: z.string().min(1),
        previousValue: z.any().optional(),
        nextValue: z.any().optional(),
      })
      .optional(),
  })
  .refine(
    (v) =>
      v.additionalClausesDoc !== undefined ||
      v.sectionAddendums !== undefined ||
      v.contractTemplateInput !== undefined,
    {
      message:
        "El cuerpo debe incluir al menos additionalClausesDoc, sectionAddendums o contractTemplateInput",
    },
  );

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
      contractInput: true,
    },
  });

  if (!legalDocument) {
    return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });
  }

  if (legalDocument.status !== "DRAFT") {
    return NextResponse.json(
      {
        error: `No se pueden editar extensiones del contrato con el documento en estado ${legalDocument.status}. Solo se permite mientras esté en DRAFT.`,
      },
      { status: 409 },
    );
  }

  const now = new Date();
  const updateData: Prisma.LegalDocumentUpdateInput = {};
  const wantsContractInputUpdate = parsed.data.contractTemplateInput !== undefined;
  const incomingContractInput = (parsed.data.contractTemplateInput ??
    null) as ContractTemplateInput | null;

  if (wantsContractInputUpdate && incomingContractInput) {
    if (incomingContractInput.kind !== legalDocument.documentKind) {
      return NextResponse.json(
        {
          error:
            `contractTemplateInput.kind="${incomingContractInput.kind}" no coincide con documentKind="${legalDocument.documentKind}".`,
        },
        { status: 422 },
      );
    }
    const issues = validateContractTemplateInput(incomingContractInput);
    if (issues.length > 0) {
      return NextResponse.json(
        { error: "El contractTemplateInput no supera validación", validationIssues: issues },
        { status: 422 },
      );
    }
    updateData.contractInput = incomingContractInput as unknown as Prisma.InputJsonValue;
    updateData.templateVersion = incomingContractInput.templateVersion ?? legalDocument.templateVersion;
  }

  // --- Cláusulas adicionales (al final del contrato) ---
  const wantsClausesUpdate = parsed.data.additionalClausesDoc !== undefined;
  const incomingDoc = parsed.data.additionalClausesDoc ?? null;
  const clearClauses = wantsClausesUpdate
    ? incomingDoc == null || isAdditionalClausesDocEmpty(incomingDoc)
    : false;

  if (wantsClausesUpdate) {
    updateData.additionalClausesDoc = clearClauses
      ? Prisma.JsonNull
      : (incomingDoc as unknown as Prisma.InputJsonValue);
    updateData.additionalClausesUpdatedAt = clearClauses ? null : now;
  }

  // --- Section addendums (dentro de secciones concretas) ---
  const wantsAddendumsUpdate = parsed.data.sectionAddendums !== undefined;
  const incomingAddendums = (parsed.data.sectionAddendums ?? null) as
    | SectionAddendumsList
    | null;
  const clearAddendums = wantsAddendumsUpdate
    ? incomingAddendums == null || isSectionAddendumsListEmpty(incomingAddendums)
    : false;

  if (wantsAddendumsUpdate && !clearAddendums && incomingAddendums) {
    const invalid = incomingAddendums.find(
      (addendum) =>
        !isValidSectionIdForKind(legalDocument.documentKind, addendum.sectionId),
    );
    if (invalid) {
      return NextResponse.json(
        {
          error: `sectionId="${invalid.sectionId}" no pertenece al catálogo de ${legalDocument.documentKind}.`,
        },
        { status: 422 },
      );
    }
  }

  if (wantsAddendumsUpdate) {
    updateData.sectionAddendums = clearAddendums
      ? Prisma.JsonNull
      : (incomingAddendums as unknown as Prisma.InputJsonValue);
    updateData.sectionAddendumsUpdatedAt = clearAddendums ? null : now;
  }

  const updated = await prisma.legalDocument.update({
    where: { id },
    data: updateData,
    select: {
      additionalClausesUpdatedAt: true,
      sectionAddendumsUpdatedAt: true,
      templateVersion: true,
    },
  });

  if (wantsClausesUpdate) {
    await appendEvent({
      type: "CONTRATO_CLAUSULAS_ADICIONALES_EDITADAS",
      aggregateType: "PROPERTY",
      aggregateId: legalDocument.propertyCode,
      payload: {
        legalDocumentId: legalDocument.id,
        operationId: legalDocument.operationId,
        documentKind: legalDocument.documentKind,
        templateVersion: legalDocument.templateVersion,
        cleared: clearClauses,
        editedAt: now.toISOString(),
      },
    });
  }

  if (wantsAddendumsUpdate) {
    await appendEvent({
      type: "CONTRATO_SECCION_AMPLIADA",
      aggregateType: "PROPERTY",
      aggregateId: legalDocument.propertyCode,
      payload: {
        legalDocumentId: legalDocument.id,
        operationId: legalDocument.operationId,
        documentKind: legalDocument.documentKind,
        templateVersion: legalDocument.templateVersion,
        cleared: clearAddendums,
        addendumsCount: clearAddendums ? 0 : (incomingAddendums?.length ?? 0),
        sectionIds: clearAddendums
          ? []
          : Array.from(new Set((incomingAddendums ?? []).map((a) => a.sectionId))),
        editedAt: now.toISOString(),
      },
    });
  }

  if (wantsContractInputUpdate && incomingContractInput) {
    const payloadEdit = parsed.data.payloadEdit;
    await appendEvent({
      type: "CONTRATO_VERSIONADO",
      aggregateType: "PROPERTY",
      aggregateId: legalDocument.propertyCode,
      payload: {
        legalDocumentId: legalDocument.id,
        operationId: legalDocument.operationId,
        propertyCode: legalDocument.propertyCode,
        documentKind: legalDocument.documentKind,
        previousTemplateVersion: legalDocument.templateVersion,
        nextTemplateVersion: updated.templateVersion,
        docxFileName: "",
        appliedSummaries: payloadEdit?.fieldPath
          ? [`Edición manual de campo: ${payloadEdit.fieldPath}`]
          : ["Edición manual del contrato"],
        patch: {
          confidence: 1,
          noOperationalChanges: false,
          changedFields: payloadEdit?.fieldPath ? [payloadEdit.fieldPath] : [],
          ambiguousPoints: [],
        },
        contractInput: incomingContractInput,
        editedAt: now.toISOString(),
        editedFrom: "payload-inline",
        ...(payloadEdit ? { payloadEdit } : {}),
      },
    });
  }

  return NextResponse.json({
    ok: true,
    additionalClausesUpdatedAt: updated.additionalClausesUpdatedAt
      ? updated.additionalClausesUpdatedAt.toISOString()
      : null,
    sectionAddendumsUpdatedAt: updated.sectionAddendumsUpdatedAt
      ? updated.sectionAddendumsUpdatedAt.toISOString()
      : null,
    templateVersion: updated.templateVersion,
  });
};

export const PATCH = withObservedRoute(
  { method: "PATCH", route: "/api/contracts/[id]" },
  patchHandler,
);
