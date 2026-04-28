import type { NotaEncargoState } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";
import type { EventRecord, JsonValue } from "@/lib/event-store/types";
import {
  extractDireccionFromRaw,
  resolveOperationType,
} from "@/lib/nota-encargo/utils";
import { normalizeCadastralRef } from "@/lib/nota-encargo/cadastral-ref";

type PropertyCreatedSnapshot = {
  codigo: string;
  ref?: string | null;
  refCatastral?: string | null;
  tipoOfer: string;
  precio: number;
  ciudad: string;
  zona: string;
};

export interface NotaEncargoLinkResult {
  linked: boolean;
  sessionId?: string;
  propertyCode?: string;
  ownerCopied?: boolean;
}

function snapshotFromEvent(event: EventRecord): PropertyCreatedSnapshot | null {
  const payload = event.payload as { snapshot?: Partial<PropertyCreatedSnapshot> } | null;
  const snapshot = payload?.snapshot;
  if (!snapshot?.codigo || !snapshot.refCatastral) return null;
  return {
    codigo: String(snapshot.codigo),
    ref: snapshot.ref ? String(snapshot.ref).trim().toUpperCase() : null,
    refCatastral: normalizeCadastralRef(String(snapshot.refCatastral)),
    tipoOfer: String(snapshot.tipoOfer ?? ""),
    precio: Number(snapshot.precio) || 0,
    ciudad: String(snapshot.ciudad ?? ""),
    zona: String(snapshot.zona ?? ""),
  };
}

function promoteState(state: NotaEncargoState): NotaEncargoState {
  return state === "PENDIENTE_PROPIEDAD" ? "PENDING" : state;
}

function hasOwnerData(session: {
  propietarioNombre: string | null;
  propietarioDni: string | null;
  propietarioTelefono: string | null;
  domicilioFiscal: string | null;
}): boolean {
  return Boolean(
    session.propietarioNombre ||
      session.propietarioDni ||
      session.propietarioTelefono ||
      session.domicilioFiscal,
  );
}

export async function linkNotaEncargoOnPropertyCreated(
  event: EventRecord,
): Promise<NotaEncargoLinkResult> {
  const snapshot = snapshotFromEvent(event);
  if (!snapshot) return { linked: false };

  const session = await prisma.notaEncargoSession.findFirst({
    where: {
      refCatastral: snapshot.refCatastral,
      propertyCode: null,
      state: { not: "CANCELADA" },
    },
    orderBy: { createdAt: "asc" },
  });

  if (!session) return { linked: false };

  const propertySnapshot = await prisma.propertySnapshot.findUnique({
    where: { codigo: snapshot.codigo },
    select: { raw: true },
  });
  const raw = (propertySnapshot?.raw ?? {}) as Record<string, unknown>;
  const direccion =
    extractDireccionFromRaw(raw, snapshot) ||
    [snapshot.zona, snapshot.ciudad].filter(Boolean).join(", ");
  const tipoOperacion = resolveOperationType(snapshot.tipoOfer);
  const ownerCopied = hasOwnerData(session);
  const provisionalId = `NOTA:${session.id}`;

  await prisma.$transaction(async (tx) => {
    await tx.notaEncargoSession.update({
      where: { id: session.id },
      data: {
        propertyCode: snapshot.codigo,
        propertyRef: snapshot.ref,
        direccion,
        tipoOperacion,
        precio: snapshot.precio,
        state: promoteState(session.state),
      },
    });

    if (ownerCopied) {
      await tx.propertyCurrent.updateMany({
        where: { codigo: snapshot.codigo },
        data: {
          propietarioNombre: session.propietarioNombre,
          propietarioDni: session.propietarioDni,
          propietarioPhone:
            session.propietarioTelefono ?? session.propietarioPhone,
          propietarioDomicilioFiscal: session.domicilioFiscal,
          propietarioRegisteredAt: new Date(),
          notaEncargoSessionId: session.id,
        },
      });
    }

    await tx.signatureRequest.updateMany({
      where: {
        id: session.signatureRequestId ?? undefined,
        operationId: provisionalId,
      },
      data: {
        operationId: snapshot.codigo,
        propertyCode: snapshot.codigo,
      },
    });

    await tx.legalDocument.updateMany({
      where: {
        id: session.legalDocumentId ?? undefined,
        operationId: provisionalId,
      },
      data: {
        operationId: snapshot.codigo,
        propertyCode: snapshot.codigo,
      },
    });
  });

  await appendEvent({
    type: "NOTA_ENCARGO_VINCULADA_A_PROPIEDAD",
    aggregateType: "PROPERTY",
    aggregateId: snapshot.codigo,
    payload: {
      sessionId: session.id,
      propertyRef: snapshot.ref,
      refCatastral: snapshot.refCatastral,
      propertyCode: snapshot.codigo,
      linkedAt: new Date().toISOString(),
      sourceEventId: event.id,
    } as unknown as JsonValue,
    correlationId: event.correlationId ?? undefined,
    causationId: event.id,
  });

  if (ownerCopied) {
    await appendEvent({
      type: "NOTA_ENCARGO_PROPIETARIO_REGISTRADO",
      aggregateType: "PROPERTY",
      aggregateId: snapshot.codigo,
      payload: {
        sessionId: session.id,
        propertyCode: snapshot.codigo,
        propertyRef: snapshot.ref,
        refCatastral: snapshot.refCatastral,
        registeredAt: new Date().toISOString(),
        sourceEventId: event.id,
      } as unknown as JsonValue,
      correlationId: event.correlationId ?? undefined,
      causationId: event.id,
    });
  }

  return {
    linked: true,
    sessionId: session.id,
    propertyCode: snapshot.codigo,
    ownerCopied,
  };
}
