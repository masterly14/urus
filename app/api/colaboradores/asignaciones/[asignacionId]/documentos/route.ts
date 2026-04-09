import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uploadContractDocument } from "@/lib/cloudinary/upload-document";
import { withObservedRoute } from "@/lib/observability";


type Params = { params: Promise<{ asignacionId: string }> };

/**
 * GET /api/colaboradores/asignaciones/:asignacionId/documentos
 */
const getHandler = async (_request: Request, { params }: Params) => {
  const { asignacionId } = await params;

  try {
    const documentos = await prisma.documentoColaborador.findMany({
      where: { asignacionId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ documentos });
  } catch (error) {
    console.error("[api/documentos] GET error:", error);
    return NextResponse.json({ error: "Error al listar documentos" }, { status: 500 });
  }
}

export const GET = withObservedRoute({ method: "GET", route: "/api/colaboradores/asignaciones/[asignacionId]/documentos" }, getHandler);

/**
 * POST /api/colaboradores/asignaciones/:asignacionId/documentos
 * Recibe FormData con: file (File), hitoId? (string), uploadedBy? (string)
 * Sube a Cloudinary y guarda metadata en documentos_colaborador.
 */
const postHandler = async (request: Request, { params }: Params) => {
  const { asignacionId } = await params;

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

  const hitoId = formData.get("hitoId")?.toString() || null;
  const uploadedBy = formData.get("uploadedBy")?.toString() || "";

  try {
    const asignacion = await prisma.colaboradorAsignacion.findUnique({
      where: { id: asignacionId },
      include: {
        colaborador: { select: { nombre: true } },
        operacion: { select: { codigo: true } },
      },
    });

    if (!asignacion) {
      return NextResponse.json({ error: "Asignación no encontrada" }, { status: 404 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const folder = `colaboradores/${asignacion.operacion.codigo}/${asignacion.colaborador.nombre}`;

    const result = await uploadContractDocument({
      buffer,
      fileName: file.name,
      folder,
      tags: ["colaborador", asignacion.operacion.codigo],
      context: {
        asignacionId,
        colaborador: asignacion.colaborador.nombre,
        operacion: asignacion.operacion.codigo,
      },
    });

    const doc = await prisma.documentoColaborador.create({
      data: {
        asignacionId,
        hitoId,
        nombre: file.name,
        cloudinaryUrl: result.secureUrl,
        publicId: result.publicId,
        formato: result.format,
        bytes: result.bytes,
        uploadedBy,
      },
    });

    return NextResponse.json({ ok: true, documento: doc }, { status: 201 });
  } catch (error) {
    console.error("[api/documentos] POST error:", error);
    return NextResponse.json({ error: "Error al subir documento" }, { status: 500 });
  }
}

export const POST = withObservedRoute({ method: "POST", route: "/api/colaboradores/asignaciones/[asignacionId]/documentos" }, postHandler);
