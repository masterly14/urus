import type { OperacionEstado } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { hasOpenIncidencia } from "@/lib/postventa/send-message-handler";
import type {
  EtapaPostVenta,
  MensajePostVenta,
  OperacionPostVenta,
  PipelineComercialFilter,
} from "./pipeline-types";

const CLOSED_OPERATION_STATES = [
  "CERRADA_VENTA",
  "CERRADA_ALQUILER",
  "CERRADA_TRASPASO",
] as const;

const MAX_PIPELINE_ITEMS = 100;

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function extractAddress(raw: unknown): string | null {
  const payload = asRecord(raw);
  return (
    readString(payload.direccion) ??
    readString(payload.direction) ??
    readString(payload["street"]) ??
    readString(payload["calle"])
  );
}

function toStageFromPostventaStep(step: string): EtapaPostVenta | null {
  if (step === "D0_AGRADECIMIENTO") return 1;
  if (step === "D3_SOPORTE") return 2;
  if (step === "D10_RESENA") return 3;
  if (step === "D21_REFERIDOS") return 4;
  if (step === "D90_RECAPTACION") return 5;
  return null;
}

function toStageFromPostSalePhase(phase: string): EtapaPostVenta | null {
  if (phase === "agradecimiento") return 1;
  if (phase === "soporte") return 2;
  if (phase === "resena") return 3;
  if (phase === "referidos") return 4;
  if (phase === "recaptacion") return 5;
  return null;
}

function parseIdempotencyStage(key: string): EtapaPostVenta | null {
  const parts = key.split(":");
  if (parts.length < 3) return null;
  if (parts[0] === "postventa") return toStageFromPostventaStep(parts[2] ?? "");
  if (parts[0] === "post_sale") return toStageFromPostSalePhase(parts[2] ?? "");
  return null;
}

function stageLabel(stage: EtapaPostVenta): string {
  if (stage === 1) return "Agradecimiento enviado";
  if (stage === 2) return "Soporte post-venta enviado";
  if (stage === 3) return "Solicitud de reseña enviada";
  if (stage === 4) return "Solicitud de referidos enviada";
  return "Re-captación enviada";
}

function inferTipoCliente(value: string | null): "comprador" | "inversor" | "vendedor" {
  if (value === "inversor" || value === "vendedor" || value === "comprador") return value;
  return "comprador";
}

function buildMessages(args: {
  propertyCode: string;
  operationId: string;
  cadenceJobs: Array<{ id: string; idempotencyKey: string | null; completedAt: Date | null }>;
  postventaEvents: Array<{ id: string; type: string; occurredAt: Date }>;
}): MensajePostVenta[] {
  const rows: MensajePostVenta[] = [];

  for (const job of args.cadenceJobs) {
    if (!job.idempotencyKey || !job.completedAt) continue;
    const stage = parseIdempotencyStage(job.idempotencyKey);
    if (!stage) continue;
    rows.push({
      id: `job:${job.id}`,
      etapa: stage,
      tipo: "enviado",
      contenido: stageLabel(stage),
      fecha: job.completedAt.toISOString(),
    });
  }

  for (const event of args.postventaEvents) {
    if (event.type === "INCIDENCIA_POSTVENTA_ABIERTA") {
      rows.push({
        id: `event:${event.id}`,
        etapa: 2,
        tipo: "respuesta",
        contenido: "Cliente reporta incidencia post-venta (necesita ayuda).",
        fecha: event.occurredAt.toISOString(),
      });
      continue;
    }

    if (event.type === "INCIDENCIA_POSTVENTA_RESUELTA") {
      rows.push({
        id: `event:${event.id}`,
        etapa: 2,
        tipo: "enviado",
        contenido: "Incidencia post-venta marcada como resuelta.",
        fecha: event.occurredAt.toISOString(),
      });
      continue;
    }

    if (event.type === "RESENA_SOLICITADA") {
      rows.push({
        id: `event:${event.id}`,
        etapa: 3,
        tipo: "enviado",
        contenido: "Solicitud de reseña enviada.",
        fecha: event.occurredAt.toISOString(),
      });
      continue;
    }

    if (event.type === "RECORDATORIO_RESENA_ENVIADO") {
      rows.push({
        id: `event:${event.id}`,
        etapa: 3,
        tipo: "enviado",
        contenido: "Recordatorio de reseña enviado.",
        fecha: event.occurredAt.toISOString(),
      });
      continue;
    }

    if (event.type === "REFERIDO_SOLICITUD_ENVIADA") {
      rows.push({
        id: `event:${event.id}`,
        etapa: 4,
        tipo: "enviado",
        contenido: "Solicitud de referidos enviada.",
        fecha: event.occurredAt.toISOString(),
      });
    }
  }

  const dedup = new Map<string, MensajePostVenta>();
  for (const row of rows) {
    const key = `${row.etapa}:${row.tipo}:${row.contenido}:${row.fecha}`;
    if (!dedup.has(key)) dedup.set(key, row);
  }

  return [...dedup.values()].sort(
    (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime(),
  );
}

async function buildOperacionPostventa(operacionId: string): Promise<OperacionPostVenta | null> {
  const operacion = await prisma.operacion.findUnique({
    where: { id: operacionId },
    select: {
      id: true,
      propertyCode: true,
      closedAt: true,
      createdAt: true,
      comercialId: true,
      demandId: true,
      estado: true,
      codigo: true,
    },
  });

  if (!operacion) return null;
  if (!operacion.closedAt && !CLOSED_OPERATION_STATES.includes(operacion.estado as never)) {
    return null;
  }

  const closedAt = operacion.closedAt ?? operacion.createdAt;
  const propertyCode = operacion.propertyCode;
  const idKey = operacion.id;

  const [
    propertyCurrent,
    propertySnapshot,
    comercial,
    buyerParty,
    sellerParty,
    demand,
    legalDocuments,
    cadenceJobs,
    postventaEvents,
    latestClosedEvent,
  ] = await Promise.all([
    prisma.propertyCurrent.findUnique({
      where: { codigo: propertyCode },
      select: { titulo: true, precio: true, zona: true, ciudad: true },
    }),
    prisma.propertySnapshot.findUnique({
      where: { codigo: propertyCode },
      select: { titulo: true, precio: true, zona: true, ciudad: true, raw: true, ref: true },
    }),
    operacion.comercialId
      ? prisma.comercial.findUnique({
          where: { id: operacion.comercialId },
          select: { id: true, nombre: true, ciudad: true },
        })
      : Promise.resolve(null),
    prisma.legalDocumentParty.findFirst({
      where: {
        role: "COMPRADOR",
        legalDocument: { propertyCode },
      },
      select: { fullName: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.legalDocumentParty.findFirst({
      where: {
        role: "VENDEDOR",
        legalDocument: { propertyCode },
      },
      select: { fullName: true },
      orderBy: { createdAt: "desc" },
    }),
    operacion.demandId
      ? prisma.demandCurrent.findUnique({
          where: { codigo: operacion.demandId },
          select: { nombre: true, leadStatus: true },
        })
      : Promise.resolve(null),
    prisma.legalDocument.findMany({
      where: { propertyCode },
      select: {
        id: true,
        documentKind: true,
        cloudinaryUrl: true,
        signedDocumentUrl: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.jobQueue.findMany({
      where: {
        status: "COMPLETED",
        OR: [
          { idempotencyKey: { startsWith: `postventa:${idKey}:` } },
          { idempotencyKey: { startsWith: `postventa:${propertyCode}:` } },
          { idempotencyKey: { startsWith: `post_sale:${propertyCode}:` } },
        ],
      },
      select: { id: true, idempotencyKey: true, completedAt: true },
    }),
    prisma.event.findMany({
      where: {
        aggregateId: propertyCode,
        type: {
          in: [
            "INCIDENCIA_POSTVENTA_ABIERTA",
            "INCIDENCIA_POSTVENTA_RESUELTA",
            "RESENA_SOLICITADA",
            "RECORDATORIO_RESENA_ENVIADO",
            "REFERIDO_SOLICITUD_ENVIADA",
          ],
        },
      },
      orderBy: { occurredAt: "asc" },
      select: { id: true, type: true, occurredAt: true },
    }),
    prisma.event.findFirst({
      where: { aggregateId: propertyCode, type: "OPERACION_CERRADA" },
      orderBy: { occurredAt: "desc" },
      select: { payload: true },
    }),
  ]);

  const messages = buildMessages({
    propertyCode,
    operationId: operacion.id,
    cadenceJobs,
    postventaEvents,
  });

  let maxStage = 1 as EtapaPostVenta;
  for (const msg of messages) {
    if (msg.etapa > maxStage) maxStage = msg.etapa;
  }

  const incidenciaAbierta = await hasOpenIncidencia(propertyCode, closedAt);
  if (incidenciaAbierta && maxStage > 2) {
    maxStage = 2;
  }

  const eventPayload = asRecord(latestClosedEvent?.payload);
  const tipoCliente = inferTipoCliente(readString(eventPayload.clientType));
  const direccion =
    extractAddress(propertySnapshot?.raw) ??
    propertyCurrent?.titulo ??
    propertySnapshot?.titulo ??
    `${propertyCode} · ${propertySnapshot?.ref ?? operacion.codigo}`;

  const comprador = buyerParty?.fullName ?? demand?.nombre ?? "Cliente comprador";
  const vendedor = sellerParty?.fullName ?? "Cliente vendedor";
  const checklistCompleto = maxStage === 5 && !incidenciaAbierta;

  return {
    id: operacion.id,
    propiedad: propertyCode,
    direccion,
    precio: propertyCurrent?.precio ?? propertySnapshot?.precio ?? 0,
    fechaCierre: closedAt.toISOString(),
    comercial: comercial?.id ?? "system",
    comercialNombre: comercial?.nombre ?? undefined,
    comercialCiudad: comercial?.ciudad ?? undefined,
    operacionEstado: operacion.estado,
    demandLeadStatus: demand?.leadStatus ?? undefined,
    etapaActual: maxStage,
    tipoCliente,
    mensajes: messages,
    checklistCompleto,
    comprador,
    vendedor,
    documentos: legalDocuments.map((doc) => ({
      id: doc.id,
      nombre: `${doc.documentKind}.pdf`,
      url: doc.signedDocumentUrl ?? doc.cloudinaryUrl ?? undefined,
      fecha: doc.createdAt.toISOString(),
    })),
  };
}

export async function listPostventaPipeline(limitParam?: number): Promise<{
  operaciones: OperacionPostVenta[];
  comerciales: PipelineComercialFilter[];
}> {
  const limit = Math.min(Math.max(limitParam ?? 50, 1), MAX_PIPELINE_ITEMS);

  const operaciones = await prisma.operacion.findMany({
    where: {
      OR: [{ closedAt: { not: null } }, { estado: { in: [...CLOSED_OPERATION_STATES] } }],
    },
    select: { id: true },
    orderBy: [{ closedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
  });

  const detailed = await Promise.all(
    operaciones.map((op) => buildOperacionPostventa(op.id)),
  );

  const rows = detailed.filter((row): row is OperacionPostVenta => Boolean(row));

  const comercialesActivos = await prisma.comercial.findMany({
    where: { activo: true },
    select: { id: true, nombre: true },
    orderBy: { nombre: "asc" },
  });

  const comercialFilters: PipelineComercialFilter[] = [
    { id: "system", nombre: "Sin comercial asignado" },
    ...comercialesActivos.map((c) => ({ id: c.id, nombre: c.nombre })),
  ];

  return { operaciones: rows, comerciales: comercialFilters };
}

export async function getPostventaPipelineOperation(
  operacionId: string,
): Promise<OperacionPostVenta | null> {
  return buildOperacionPostventa(operacionId);
}
