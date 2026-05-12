"use client";

import { use, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  MapPin,
  Clock,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Target,
  Wrench,
  Users,
  Briefcase,
  Edit2,
  Loader2,
  Building2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ClasificacionBadge } from "@/components/colaboradores/clasificacion-badge";
import type { ColaboradorClasificacion } from "@/components/colaboradores/clasificacion-badge";
import { ColaboradorForm } from "@/components/colaboradores/colaborador-form";
import { HitoKanban } from "@/components/colaboradores/hito-kanban";
import { AsignarDialog } from "@/components/colaboradores/asignar-dialog";
import { DocumentoUpload } from "@/components/colaboradores/documento-upload";

type HitoEstado = "PENDIENTE" | "EN_PROGRESO" | "COMPLETADO" | "BLOQUEADO" | "CANCELADO";

type Documento = {
  id: string;
  nombre: string;
  cloudinaryUrl: string;
  publicId: string;
  formato: string;
  bytes: number;
  createdAt: string;
  uploadedBy: string;
};

type Hito = {
  id: string;
  nombre: string;
  orden: number;
  estado: HitoEstado;
  iniciadoAt: string | null;
  completadoAt: string | null;
  slaDias: number | null;
  slaVenceAt: string | null;
  notas: string;
  documentos: Documento[];
};

type Asignacion = {
  id: string;
  operacionId: string;
  operacionCodigo: string;
  operacionPropertyCode: string;
  operacionEstado: string;
  estado: string;
  notas: string;
  assignedAt: string;
  completedAt: string | null;
  hitos: Hito[];
  documentos: Documento[];
};

type ColaboradorDetail = {
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
  asignacionesActivas: number;
  asignacionesCompletadas: number;
  asignacionesTotales: number;
  hitosCompletados: number;
  hitosTotales: number;
  hitosVencidos: number;
  slaCumplimiento: number;
  avgDiasHito: number | null;
  clasificacion: { clasificacion: ColaboradorClasificacion };
  asignaciones: Asignacion[];
};

export default function ColaboradorDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const [detail, setDetail] = useState<ColaboradorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [tipos, setTipos] = useState<string[]>([]);

  const fetchDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/colaboradores/${resolvedParams.id}`);
      if (!res.ok) throw new Error();
      setDetail(await res.json());
    } catch {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [resolvedParams.id]);

  useEffect(() => {
    fetchDetail();
    fetch("/api/colaboradores?activo=true")
      .then((r) => r.json())
      .then((d) => setTipos((d.tipos ?? []).map((t: { nombre: string }) => t.nombre)))
      .catch(() => null);
  }, [fetchDetail]);

  const handleChangeHitoEstado = async (
    asignacionId: string,
    hitoId: string,
    nuevoEstado: HitoEstado,
  ) => {
    await fetch(
      `/api/colaboradores/asignaciones/${asignacionId}/hitos/${hitoId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: nuevoEstado }),
      },
    );
    fetchDetail();
  };

  const handleEdit = async (formData: Record<string, string>) => {
    const res = await fetch(`/api/colaboradores/${resolvedParams.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.error || "Error");
    }
    setEditOpen(false);
    fetchDetail();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto pb-10">
        <Link href="/platform/colaboradores" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Volver a Colaboradores
        </Link>
        <Card className="shadow-sm border-border/60">
          <CardContent className="flex flex-col items-center justify-center py-20 text-center bg-accent/10">
            <p className="text-lg font-semibold mb-2 text-foreground">Colaborador no encontrado</p>
            <p className="text-sm text-muted-foreground">El colaborador solicitado no existe o ha sido eliminado.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const slaColor = detail.slaCumplimiento >= 80
    ? "var(--urus-success)"
    : detail.slaCumplimiento >= 60
      ? "var(--urus-warning)"
      : "var(--urus-danger)";

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      {/* Back link */}
      <Link
        href="/platform/colaboradores"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
      >
        <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
        Volver a Colaboradores
      </Link>

      {/* Header Profile Card */}
      <Card className="shadow-sm border-border/60 overflow-hidden">
        <div className="h-1.5 w-full" style={{ backgroundColor: slaColor }} />
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            <div className="space-y-6 flex-1">
              {/* Profile Info */}
              <div className="flex items-center gap-4 flex-wrap">
                <div className="h-16 w-16 rounded-full bg-secondary/10 flex items-center justify-center text-xl font-bold text-secondary border border-secondary/20 shrink-0">
                  {detail.nombre.split(" ")[0].slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-foreground">{detail.nombre}</h1>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <Badge variant="secondary" className="font-normal bg-accent text-foreground hover:bg-accent">
                      {detail.tipo}
                    </Badge>
                    {detail.ciudad && (
                      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" /> {detail.ciudad}
                      </span>
                    )}
                    <ClasificacionBadge clasificacion={detail.clasificacion.clasificacion} />
                  </div>
                </div>
              </div>

              {detail.especialidad && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-accent/30 inline-flex px-3 py-1.5 rounded-md border border-border/50">
                  <Wrench className="h-4 w-4 shrink-0" />
                  <span className="font-medium text-foreground mr-1">Especialidad:</span> {detail.especialidad}
                </div>
              )}

              {/* KPIs Row */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pt-4 border-t border-border/40">
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground font-medium">Cumplimiento SLA</p>
                  <p className="text-2xl font-bold font-mono" style={{ color: slaColor }}>
                    {detail.slaCumplimiento}%
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground font-medium">Ops Activas</p>
                  <p className="text-2xl font-bold font-mono text-foreground">{detail.asignacionesActivas}</p>
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground font-medium">Ops Totales</p>
                  <p className="text-2xl font-bold font-mono text-foreground">{detail.asignacionesTotales}</p>
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground font-medium">Hitos Completados</p>
                  <p className="text-2xl font-bold font-mono text-foreground">
                    {detail.hitosCompletados}<span className="text-base text-muted-foreground ml-1">/ {detail.hitosTotales}</span>
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground font-medium">Tiempo Medio</p>
                  <p className="text-2xl font-bold font-mono text-foreground">
                    {detail.avgDiasHito !== null ? `${detail.avgDiasHito}d` : "—"}
                  </p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-row lg:flex-col gap-3 shrink-0 w-full lg:w-auto">
              <AsignarDialog
                colaboradorId={detail.id}
                colaboradorTipo={detail.tipo}
                onAssigned={fetchDetail}
              />
              <Button variant="outline" className="gap-2 w-full lg:w-auto bg-card shadow-sm" onClick={() => setEditOpen(true)}>
                <Edit2 className="h-4 w-4 text-muted-foreground" />
                Editar Perfil
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Colaborador</DialogTitle>
          </DialogHeader>
          <ColaboradorForm
            initialData={detail}
            tipos={tipos}
            onSubmit={handleEdit}
            onCancel={() => setEditOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Column: Asignaciones (2/3 width on large screens) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center gap-2 pb-2 border-b border-border/60">
            <Briefcase className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold text-foreground">Operaciones Asignadas</h2>
            <Badge variant="secondary" className="ml-2 bg-accent text-foreground">{detail.asignaciones.length}</Badge>
          </div>

          {detail.asignaciones.length === 0 ? (
            <Card className="shadow-sm border-border/60">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center bg-accent/10">
                <Briefcase className="h-10 w-10 text-muted-foreground/30 mb-4" />
                <p className="text-base font-medium text-foreground">Sin operaciones asignadas</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Usa el botón &quot;Asignar a Operación&quot; arriba para vincular este colaborador a un proyecto.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {detail.asignaciones.map((asig) => (
                <Card key={asig.id} className="shadow-sm border-border/60 overflow-hidden">
                  <div className="p-4 border-b border-border/40 bg-accent/10">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-semibold font-mono text-foreground">
                            {asig.operacionCodigo}
                          </span>
                        </div>
                        <div className="h-4 w-px bg-border/60 hidden sm:block" />
                        <span className="text-sm text-muted-foreground">
                          Ref: <span className="font-medium text-foreground">{asig.operacionPropertyCode}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="font-normal bg-card border-border/50 text-muted-foreground">
                          {asig.operacionEstado}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className="font-medium"
                          style={{
                            backgroundColor: asig.estado === "COMPLETADA"
                              ? "color-mix(in oklch, var(--urus-success) 15%, transparent)"
                              : asig.estado === "EN_PROGRESO"
                                ? "color-mix(in oklch, var(--urus-info) 15%, transparent)"
                                : asig.estado === "BLOQUEADA"
                                  ? "color-mix(in oklch, var(--urus-danger) 15%, transparent)"
                                  : "var(--accent)",
                            color: asig.estado === "COMPLETADA"
                              ? "var(--urus-success)"
                              : asig.estado === "EN_PROGRESO"
                                ? "var(--urus-info)"
                                : asig.estado === "BLOQUEADA"
                                  ? "var(--urus-danger)"
                                  : "var(--muted-foreground)",
                          }}
                        >
                          {asig.estado}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <CardContent className="p-5 space-y-6">
                    {asig.hitos.length > 0 ? (
                      <div>
                        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Seguimiento de Hitos</h4>
                        <HitoKanban
                          hitos={asig.hitos}
                          onChangeEstado={(hitoId, estado) =>
                            handleChangeHitoEstado(asig.id, hitoId, estado)
                          }
                        />
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">Esta asignación no tiene hitos configurados.</p>
                    )}

                    <div className="pt-4 border-t border-border/40">
                      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Documentos Adjuntos</h4>
                      <DocumentoUpload
                        asignacionId={asig.id}
                        documentos={asig.documentos}
                        onUploaded={fetchDetail}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar Column: Contacto & Notas (1/3 width on large screens) */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 pb-2 border-b border-border/60">
            <Users className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold text-foreground">Información de Contacto</h2>
          </div>

          <Card className="shadow-sm border-border/60">
            <CardContent className="p-5">
              {!(detail.contactoNombre || detail.contactoEmail || detail.contactoTelefono || detail.notas) ? (
                <div className="text-center py-6">
                  <p className="text-sm text-muted-foreground">No hay información de contacto registrada.</p>
                  <Button variant="link" size="sm" className="mt-2 text-secondary" onClick={() => setEditOpen(true)}>
                    Añadir detalles
                  </Button>
                </div>
              ) : (
                <div className="space-y-5">
                  {detail.contactoNombre && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Persona de Contacto</p>
                      <p className="text-sm font-medium text-foreground">{detail.contactoNombre}</p>
                    </div>
                  )}
                  
                  {detail.contactoEmail && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Correo Electrónico</p>
                      <a href={`mailto:${detail.contactoEmail}`} className="text-sm text-secondary hover:underline">
                        {detail.contactoEmail}
                      </a>
                    </div>
                  )}
                  
                  {detail.contactoTelefono && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Teléfono</p>
                      <a href={`tel:${detail.contactoTelefono}`} className="text-sm text-foreground hover:text-secondary transition-colors">
                        {detail.contactoTelefono}
                      </a>
                    </div>
                  )}

                  {detail.notas && (
                    <div className="pt-4 border-t border-border/40">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Notas Internas</p>
                      <div className="bg-accent/20 rounded-md p-3 border border-border/30">
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{detail.notas}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
