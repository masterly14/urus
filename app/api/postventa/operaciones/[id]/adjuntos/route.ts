import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import {
  ADJUNTO_ALLOWED_EXTENSIONS,
  ADJUNTO_MAX_FILE_BYTES,
  ADJUNTO_MAX_TOTAL_BYTES,
  extractExtension,
  isAllowedExtension,
} from "@/lib/postventa/panel/constants";
import { canDeleteAdjunto } from "@/lib/postventa/panel/access";
import { uploadAdjunto } from "@/lib/postventa/panel/upload-adjunto";
import type { PanelAdjuntoDTO } from "@/lib/postventa/panel/types";

type Params = { params: Promise<{ id: string }> };

function toDTO(
  adj: {
    id: string;
    operacionId: string;
    nombre: string;
    mimeType: string;
    cloudinaryUrl: string;
    publicId: string;
    resourceType: string;
    bytes: number;
    uploadedByUserId: string;
    uploadedByName: string;
    createdAt: Date;
  },
  session: { userId: string; role: "ceo" | "admin" | "comercial" },
): PanelAdjuntoDTO {
  return {
    id: adj.id,
    operacionId: adj.operacionId,
    nombre: adj.nombre,
    mimeType: adj.mimeType,
    cloudinaryUrl: adj.cloudinaryUrl,
    publicId: adj.publicId,
    resourceType: adj.resourceType,
    bytes: adj.bytes,
    uploadedByUserId: adj.uploadedByUserId,
    uploadedByName: adj.uploadedByName,
    createdAt: adj.createdAt.toISOString(),
    canDelete: canDeleteAdjunto(session, adj),
  };
}

/**
 * GET /api/postventa/operaciones/:id/adjuntos
 */
const getHandler = async (request: Request, { params }: Params) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  const { id: operacionId } = await params;

  const operacion = await prisma.operacion.findUnique({
    where: { id: operacionId },
    select: { id: true },
  });
  if (!operacion) {
    return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 });
  }

  const adjuntos = await prisma.operacionAdjunto.findMany({
    where: { operacionId },
    orderBy: { createdAt: "desc" },
  });

  const totalBytes = adjuntos.reduce((s, a) => s + a.bytes, 0);

  return NextResponse.json({
    adjuntos: adjuntos.map((a) => toDTO(a, session)),
    quota: {
      maxFileBytes: ADJUNTO_MAX_FILE_BYTES,
      maxTotalBytes: ADJUNTO_MAX_TOTAL_BYTES,
      usedBytes: totalBytes,
      availableBytes: Math.max(0, ADJUNTO_MAX_TOTAL_BYTES - totalBytes),
    },
  });
};

/**
 * POST /api/postventa/operaciones/:id/adjuntos
 * FormData con `file: File`. Valida extensión, tamaño y cuota total.
 */
const postHandler = async (request: Request, { params }: Params) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  const { id: operacionId } = await params;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "FormData inválido" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Campo 'file' requerido" }, { status: 400 });
  }

  const ext = extractExtension(file.name);
  if (!isAllowedExtension(ext)) {
    return NextResponse.json(
      {
        error: `Formato no permitido. Permitidos: ${ADJUNTO_ALLOWED_EXTENSIONS.join(", ")}`,
      },
      { status: 400 },
    );
  }

  if (file.size > ADJUNTO_MAX_FILE_BYTES) {
    return NextResponse.json(
      {
        error: `Archivo supera el tamaño máximo (${Math.round(
          ADJUNTO_MAX_FILE_BYTES / 1024 / 1024,
        )} MB)`,
      },
      { status: 400 },
    );
  }

  const operacion = await prisma.operacion.findUnique({
    where: { id: operacionId },
    select: { id: true, codigo: true },
  });
  if (!operacion) {
    return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 });
  }

  const currentTotal = await prisma.operacionAdjunto.aggregate({
    where: { operacionId },
    _sum: { bytes: true },
  });
  const used = currentTotal._sum.bytes ?? 0;
  if (used + file.size > ADJUNTO_MAX_TOTAL_BYTES) {
    return NextResponse.json(
      {
        error: `Se excede la cuota total de la operación (${Math.round(
          ADJUNTO_MAX_TOTAL_BYTES / 1024 / 1024,
        )} MB)`,
      },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const folder = `operaciones/${operacion.codigo}/adjuntos`;

  const uploaded = await uploadAdjunto({
    buffer,
    fileName: file.name,
    extension: ext,
    folder,
    tags: [operacion.codigo],
    context: {
      operacionId,
      operacion: operacion.codigo,
      uploadedBy: session.userId,
    },
  });

  const record = await prisma.operacionAdjunto.create({
    data: {
      operacionId,
      nombre: file.name,
      mimeType: uploaded.mimeType,
      cloudinaryUrl: uploaded.secureUrl,
      publicId: uploaded.publicId,
      resourceType: uploaded.resourceType,
      bytes: uploaded.bytes,
      uploadedByUserId: session.userId,
      uploadedByName: session.nombre,
    },
  });

  return NextResponse.json({ adjunto: toDTO(record, session) }, { status: 201 });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/postventa/operaciones/[id]/adjuntos" },
  getHandler,
);

export const POST = withObservedRoute(
  { method: "POST", route: "/api/postventa/operaciones/[id]/adjuntos" },
  postHandler,
);
