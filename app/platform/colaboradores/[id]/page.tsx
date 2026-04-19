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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <div className="space-y-6">
        <Link href="/platform/colaboradores" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Volver a Colaboradores
        </Link>
        <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
          <CardContent className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-lg font-semibold mb-2">Colaborador no encontrado</p>
            <p className="text-sm text-muted-foreground">El colaborador solicitado no existe.</p>
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
    <div className="space-y-6">
      <Link
        href="/platform/colaboradores"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
      >
        <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
        Volver a Colaboradores
      </Link>

      {/* Header */}
      <Card className="border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden">
        <div className="h-1.5" style={{ backgroundColor: slaColor }} />
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div className="space-y-3 flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="h-12 w-12 rounded-xl bg-accent/40 flex items-center justify-center text-lg font-bold text-secondary">
                  {detail.nombre.split(" ")[0].slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight">{detail.nombre}</h1>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">{detail.tipo}</Badge>
                    {detail.ciudad && (
                      <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" /> {detail.ciudad}
                      </span>
                    )}
                    <ClasificacionBadge clasificacion={detail.clasificacion.clasificacion} />
                  </div>
                </div>
              </div>

              {detail.especialidad && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Wrench className="h-3.5 w-3.5 shrink-0" />
                  {detail.especialidad}
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pt-2">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">SLA</p>
                  <p className="text-lg font-bold font-mono" style={{ color: slaColor }}>
                    {detail.slaCumplimiento}%
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ops Activas</p>
                  <p className="text-lg font-bold font-mono">{detail.asignacionesActivas}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ops Total</p>
                  <p className="text-lg font-bold font-mono">{detail.asignacionesTotales}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Hitos</p>
                  <p className="text-lg font-bold font-mono">
                    {detail.hitosCompletados}<span className="text-sm text-muted-foreground">/{detail.hitosTotales}</span>
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Tiempo Medio</p>
                  <p className="text-lg font-bold font-mono">
                    {detail.avgDiasHito !== null ? `${detail.avgDiasHito}d` : "—"}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" className="gap-1" onClick={() => setEditOpen(true)}>
                <Edit2 className="h-3 w-3" />
                Editar
              </Button>
              <AsignarDialog
                colaboradorId={detail.id}
                colaboradorTipo={detail.tipo}
                onAssigned={fetchDetail}
              />
            </div>
          </div>
        </CardContent>
      </Card>

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

      {/* Asignaciones con kanban */}
      {detail.asignaciones.length === 0 ? (
        <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Briefcase className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium">Sin operaciones asignadas</p>
            <p className="text-xs text-muted-foreground mt-1">
              Usa &quot;Asignar a Operación&quot; para vincular este colaborador.
            </p>
          </CardContent>
        </Card>
      ) : (
        detail.asignaciones.map((asig) => (
          <Card key={asig.id} className="border-border/50 bg-card/60 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-secondary" />
                  <CardTitle className="text-sm font-semibold font-mono">
                    {asig.operacionCodigo}
                  </CardTitle>
                  <Badge variant="outline" className="text-[9px]">{asig.operacionEstado}</Badge>
                  <Badge
                    variant="outline"
                    className="text-[9px]"
                    style={{
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
                <span className="text-[10px] text-muted-foreground">
                  Propiedad: {asig.operacionPropertyCode}
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              {asig.hitos.length > 0 && (
                <HitoKanban
                  hitos={asig.hitos}
                  onChangeEstado={(hitoId, estado) =>
                    handleChangeHitoEstado(asig.id, hitoId, estado)
                  }
                />
              )}

              <div className="border-t border-border/20 pt-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                  Documentos de la asignación
                </p>
                <DocumentoUpload
                  asignacionId={asig.id}
                  documentos={asig.documentos}
                  onUploaded={fetchDetail}
                />
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {/* Contacto */}
      {(detail.contactoNombre || detail.contactoEmail || detail.contactoTelefono) && (
        <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-secondary" />
              <CardTitle className="text-sm font-semibold">Contacto</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {detail.contactoNombre && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Nombre</p>
                  <p className="text-sm">{detail.contactoNombre}</p>
                </div>
              )}
              {detail.contactoEmail && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Email</p>
                  <p className="text-sm">{detail.contactoEmail}</p>
                </div>
              )}
              {detail.contactoTelefono && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Teléfono</p>
                  <p className="text-sm">{detail.contactoTelefono}</p>
                </div>
              )}
            </div>
            {detail.notas && (
              <div className="mt-3 pt-3 border-t border-border/20">
                <p className="text-[10px] text-muted-foreground uppercase mb-1">Notas</p>
                <p className="text-sm text-muted-foreground">{detail.notas}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
