"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Building, GraduationCap, Gavel, FileCheck, CircleUserRound, MoreHorizontal, ArrowRight, CheckCircle2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const TIPO_ICON = {
  BANCO: Building,
  API: GraduationCap,
  ABOGADO: Gavel,
  GESTORIA: FileCheck,
  default: CircleUserRound,
} as const;

function getHitoActivo(hitos: any[]) {
  if (!hitos || hitos.length === 0) return null;
  return hitos.find((h) => h.estado === "EN_CURSO") || hitos.find((h) => h.estado === "PENDIENTE") || null;
}

export function OperacionColaboradorCard({
  asignacion,
  onRefresh,
}: {
  asignacion: any;
  onRefresh: () => void;
}) {
  const Icon = TIPO_ICON[asignacion.colaborador.tipo as keyof typeof TIPO_ICON] || TIPO_ICON.default;
  const hitoActivo = getHitoActivo(asignacion.hitos);
  const isCompletado = asignacion.estado === "COMPLETADO";
  const isCancelado = asignacion.estado === "CANCELADO";

  const [advancing, setAvanzando] = useState(false);

  const avanzarHito = async () => {
    if (!hitoActivo || advancing) return;
    setAvanzando(true);
    try {
      const res = await fetch(`/api/colaboradores/${asignacion.colaboradorId}/asignaciones/${asignacion.id}/hitos/${hitoActivo.id}/completar`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Error al avanzar hito");
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setAvanzando(false);
    }
  };

  return (
    <Card className={`relative overflow-hidden transition-colors ${isCancelado ? 'opacity-60 grayscale' : ''}`}>
      {isCompletado && (
        <div className="absolute top-0 right-0 w-16 h-16 pointer-events-none">
          <div className="absolute transform rotate-45 bg-emerald-500 text-white text-[10px] font-bold py-1 right-[-35px] top-[32px] w-[170px] text-center shadow-sm">
            COMPLETADO
          </div>
        </div>
      )}
      
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${isCompletado ? 'bg-emerald-100 text-emerald-600' : 'bg-secondary/10 text-secondary'}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h4 className="font-semibold text-sm truncate">{asignacion.colaborador.nombre}</h4>
              <p className="text-xs text-muted-foreground">{asignacion.colaborador.tipo}</p>
            </div>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => {}}>Ver detalles</DropdownMenuItem>
              {!isCancelado && !isCompletado && (
                <>
                  <DropdownMenuItem onClick={() => {}}>Editar notas</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={() => {}}>Cancelar asignación</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {!isCancelado && !isCompletado && hitoActivo && (
          <div className="rounded-md border border-border/50 bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">Hito actual: {hitoActivo.nombre}</span>
              {hitoActivo.slaDias && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-3 w-3" /> SLA: {hitoActivo.slaDias}d
                </span>
              )}
            </div>
            
            <div className="flex justify-end gap-2 pt-1">
              <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => {}}>
                Subir doc
              </Button>
              <Button size="sm" className="h-7 text-xs px-2 gap-1" onClick={avanzarHito} disabled={advancing}>
                Completar <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        {isCompletado && (
          <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50/50 rounded-md p-2">
            <CheckCircle2 className="h-4 w-4" />
            <span>Todos los hitos completados</span>
          </div>
        )}

        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/40">
          <span>Asignado hace {formatDistanceToNow(new Date(asignacion.createdAt), { locale: es })}</span>
          <span>{asignacion.hitos?.filter((h: any) => h.estado === 'COMPLETADO').length || 0}/{asignacion.hitos?.length || 0} hitos</span>
        </div>
      </CardContent>
    </Card>
  );
}
