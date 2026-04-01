import { prisma } from "@/lib/prisma";
import type {
  AsignacionEstado,
  HitoEstado,
} from "@/app/generated/prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ColaboradorListRow = {
  id: string;
  nombre: string;
  tipo: string;
  ciudad: string;
  especialidad: string;
  contactoNombre: string;
  contactoEmail: string;
  contactoTelefono: string;
  activo: boolean;
  notas: string;
  createdAt: Date;
  asignacionesActivas: number;
  asignacionesCompletadas: number;
  asignacionesTotales: number;
  hitosCompletados: number;
  hitosTotales: number;
  hitosVencidos: number;
  slaCumplimiento: number;
  avgDiasHito: number | null;
};

export type ColaboradorDetailRow = ColaboradorListRow & {
  asignaciones: AsignacionWithHitos[];
};

export type AsignacionWithHitos = {
  id: string;
  operacionId: string;
  operacionCodigo: string;
  operacionPropertyCode: string;
  operacionEstado: string;
  estado: AsignacionEstado;
  notas: string;
  assignedAt: Date;
  completedAt: Date | null;
  hitos: HitoRow[];
  documentos: DocumentoRow[];
};

export type HitoRow = {
  id: string;
  nombre: string;
  orden: number;
  estado: HitoEstado;
  iniciadoAt: Date | null;
  completadoAt: Date | null;
  slaDias: number | null;
  slaVenceAt: Date | null;
  notas: string;
  documentos: DocumentoRow[];
};

export type DocumentoRow = {
  id: string;
  nombre: string;
  cloudinaryUrl: string;
  publicId: string;
  formato: string;
  bytes: number;
  uploadedBy: string;
  createdAt: Date;
};

export type ColaboradorListFilters = {
  tipo?: string;
  ciudad?: string;
  activo?: boolean;
  search?: string;
};

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export async function listColaboradores(
  filters: ColaboradorListFilters = {},
): Promise<ColaboradorListRow[]> {
  const where: Record<string, unknown> = {};
  if (filters.tipo) where.tipo = filters.tipo;
  if (filters.ciudad) where.ciudad = filters.ciudad;
  if (filters.activo !== undefined) where.activo = filters.activo;
  if (filters.search) {
    where.nombre = { contains: filters.search, mode: "insensitive" };
  }

  const colaboradores = await prisma.colaborador.findMany({
    where,
    include: {
      asignaciones: {
        include: {
          hitos: { select: { estado: true, completadoAt: true, iniciadoAt: true, slaDias: true, slaVenceAt: true } },
        },
      },
    },
    orderBy: { nombre: "asc" },
  });

  const now = new Date();

  return colaboradores.map((c) => {
    const activas = c.asignaciones.filter((a) =>
      a.estado === "PENDIENTE" || a.estado === "EN_PROGRESO",
    );
    const completadas = c.asignaciones.filter((a) => a.estado === "COMPLETADA");
    const allHitos = c.asignaciones.flatMap((a) => a.hitos);
    const hitosCompletados = allHitos.filter((h) => h.estado === "COMPLETADO").length;
    const hitosVencidos = allHitos.filter(
      (h) =>
        h.slaVenceAt &&
        h.slaVenceAt < now &&
        h.estado !== "COMPLETADO" &&
        h.estado !== "CANCELADO",
    ).length;

    const completedHitosWithDuration = allHitos
      .filter((h) => h.iniciadoAt && h.completadoAt)
      .map((h) => (h.completadoAt!.getTime() - h.iniciadoAt!.getTime()) / (1000 * 60 * 60 * 24));

    const avgDiasHito =
      completedHitosWithDuration.length > 0
        ? completedHitosWithDuration.reduce((a, b) => a + b, 0) / completedHitosWithDuration.length
        : null;

    const hitosConSla = allHitos.filter((h) => h.slaDias && h.completadoAt && h.iniciadoAt);
    const hitosCumplidos = hitosConSla.filter((h) => {
      const dias = (h.completadoAt!.getTime() - h.iniciadoAt!.getTime()) / (1000 * 60 * 60 * 24);
      return dias <= (h.slaDias ?? Infinity);
    });
    const slaCumplimiento =
      hitosConSla.length > 0 ? (hitosCumplidos.length / hitosConSla.length) * 100 : 100;

    return {
      id: c.id,
      nombre: c.nombre,
      tipo: c.tipo,
      ciudad: c.ciudad,
      especialidad: c.especialidad,
      contactoNombre: c.contactoNombre,
      contactoEmail: c.contactoEmail,
      contactoTelefono: c.contactoTelefono,
      activo: c.activo,
      notas: c.notas,
      createdAt: c.createdAt,
      asignacionesActivas: activas.length,
      asignacionesCompletadas: completadas.length,
      asignacionesTotales: c.asignaciones.length,
      hitosCompletados,
      hitosTotales: allHitos.length,
      hitosVencidos,
      slaCumplimiento: Math.round(slaCumplimiento * 10) / 10,
      avgDiasHito: avgDiasHito !== null ? Math.round(avgDiasHito * 10) / 10 : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export async function getColaboradorDetail(
  id: string,
): Promise<ColaboradorDetailRow | null> {
  const c = await prisma.colaborador.findUnique({
    where: { id },
    include: {
      asignaciones: {
        include: {
          operacion: { select: { id: true, codigo: true, propertyCode: true, estado: true } },
          hitos: {
            include: { documentos: true },
            orderBy: { orden: "asc" },
          },
          documentos: true,
        },
        orderBy: { assignedAt: "desc" },
      },
    },
  });

  if (!c) return null;

  const now = new Date();
  const allHitos = c.asignaciones.flatMap((a) => a.hitos);
  const activas = c.asignaciones.filter(
    (a) => a.estado === "PENDIENTE" || a.estado === "EN_PROGRESO",
  );
  const completadas = c.asignaciones.filter((a) => a.estado === "COMPLETADA");
  const hitosCompletados = allHitos.filter((h) => h.estado === "COMPLETADO").length;
  const hitosVencidos = allHitos.filter(
    (h) =>
      h.slaVenceAt &&
      h.slaVenceAt < now &&
      h.estado !== "COMPLETADO" &&
      h.estado !== "CANCELADO",
  ).length;

  const completedHitosWithDuration = allHitos
    .filter((h) => h.iniciadoAt && h.completadoAt)
    .map((h) => (h.completadoAt!.getTime() - h.iniciadoAt!.getTime()) / (1000 * 60 * 60 * 24));

  const avgDiasHito =
    completedHitosWithDuration.length > 0
      ? completedHitosWithDuration.reduce((a, b) => a + b, 0) / completedHitosWithDuration.length
      : null;

  const hitosConSla = allHitos.filter((h) => h.slaDias && h.completadoAt && h.iniciadoAt);
  const hitosCumplidos = hitosConSla.filter((h) => {
    const dias = (h.completadoAt!.getTime() - h.iniciadoAt!.getTime()) / (1000 * 60 * 60 * 24);
    return dias <= (h.slaDias ?? Infinity);
  });
  const slaCumplimiento =
    hitosConSla.length > 0 ? (hitosCumplidos.length / hitosConSla.length) * 100 : 100;

  return {
    id: c.id,
    nombre: c.nombre,
    tipo: c.tipo,
    ciudad: c.ciudad,
    especialidad: c.especialidad,
    contactoNombre: c.contactoNombre,
    contactoEmail: c.contactoEmail,
    contactoTelefono: c.contactoTelefono,
    activo: c.activo,
    notas: c.notas,
    createdAt: c.createdAt,
    asignacionesActivas: activas.length,
    asignacionesCompletadas: completadas.length,
    asignacionesTotales: c.asignaciones.length,
    hitosCompletados,
    hitosTotales: allHitos.length,
    hitosVencidos,
    slaCumplimiento: Math.round(slaCumplimiento * 10) / 10,
    avgDiasHito: avgDiasHito !== null ? Math.round(avgDiasHito * 10) / 10 : null,
    asignaciones: c.asignaciones.map((a) => ({
      id: a.id,
      operacionId: a.operacion.id,
      operacionCodigo: a.operacion.codigo,
      operacionPropertyCode: a.operacion.propertyCode,
      operacionEstado: a.operacion.estado,
      estado: a.estado,
      notas: a.notas,
      assignedAt: a.assignedAt,
      completedAt: a.completedAt,
      hitos: a.hitos.map((h) => ({
        id: h.id,
        nombre: h.nombre,
        orden: h.orden,
        estado: h.estado,
        iniciadoAt: h.iniciadoAt,
        completadoAt: h.completadoAt,
        slaDias: h.slaDias,
        slaVenceAt: h.slaVenceAt,
        notas: h.notas,
        documentos: h.documentos.map((d) => ({
          id: d.id,
          nombre: d.nombre,
          cloudinaryUrl: d.cloudinaryUrl,
          publicId: d.publicId,
          formato: d.formato,
          bytes: d.bytes,
          uploadedBy: d.uploadedBy,
          createdAt: d.createdAt,
        })),
      })),
      documentos: a.documentos
        .filter((d) => !d.hitoId)
        .map((d) => ({
          id: d.id,
          nombre: d.nombre,
          cloudinaryUrl: d.cloudinaryUrl,
          publicId: d.publicId,
          formato: d.formato,
          bytes: d.bytes,
          uploadedBy: d.uploadedBy,
          createdAt: d.createdAt,
        })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

export type ColaboradorRankingRow = ColaboradorListRow & {
  clasificacion: string;
};
