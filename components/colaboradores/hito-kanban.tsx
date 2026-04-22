"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Clock,
  CheckCircle2,
  PlayCircle,
  AlertTriangle,
  Ban,
  FileText,
  ChevronRight,
} from "lucide-react";

type HitoEstado = "PENDIENTE" | "EN_PROGRESO" | "COMPLETADO" | "BLOQUEADO" | "CANCELADO";

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
  documentos: { id: string; nombre: string; cloudinaryUrl: string }[];
};

const ESTADO_CONFIG: Record<HitoEstado, { label: string; color: string; icon: typeof Clock }> = {
  PENDIENTE: { label: "Pendiente", color: "var(--muted-foreground)", icon: Clock },
  EN_PROGRESO: { label: "En Progreso", color: "var(--urus-info)", icon: PlayCircle },
  COMPLETADO: { label: "Completado", color: "var(--urus-success)", icon: CheckCircle2 },
  BLOQUEADO: { label: "Bloqueado", color: "var(--urus-danger)", icon: AlertTriangle },
  CANCELADO: { label: "Cancelado", color: "var(--muted-foreground)", icon: Ban },
};

const TRANSITIONS: Record<HitoEstado, HitoEstado[]> = {
  PENDIENTE: ["EN_PROGRESO", "CANCELADO"],
  EN_PROGRESO: ["COMPLETADO", "BLOQUEADO", "CANCELADO"],
  COMPLETADO: [],
  BLOQUEADO: ["EN_PROGRESO", "CANCELADO"],
  CANCELADO: [],
};

function isSlaVencido(slaVenceAt: string | null, estado: HitoEstado): boolean {
  if (!slaVenceAt || estado === "COMPLETADO" || estado === "CANCELADO") return false;
  return new Date(slaVenceAt) < new Date();
}

function diasHasta(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function HitoKanban({
  hitos,
  onChangeEstado,
}: {
  hitos: Hito[];
  onChangeEstado: (hitoId: string, nuevoEstado: HitoEstado) => Promise<void>;
}) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleChange = async (hitoId: string, estado: HitoEstado) => {
    setLoading(hitoId);
    try {
      await onChangeEstado(hitoId, estado);
    } finally {
      setLoading(null);
    }
  };

  const columns: HitoEstado[] = ["PENDIENTE", "EN_PROGRESO", "COMPLETADO", "BLOQUEADO"];
  const grouped = columns.map((estado) => ({
    estado,
    ...ESTADO_CONFIG[estado],
    hitos: hitos.filter((h) => h.estado === estado).sort((a, b) => a.orden - b.orden),
  }));

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {grouped.map((col) => {
        const Icon = col.icon;
        return (
          <div key={col.estado} className="flex flex-col min-w-[220px] w-[220px] shrink-0">
            <div
              className="rounded-lg px-3 py-2 mb-2 border"
              style={{
                borderColor: `color-mix(in oklch, ${col.color} 25%, transparent)`,
                backgroundColor: `color-mix(in oklch, ${col.color} 6%, transparent)`,
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5" style={{ color: col.color }} />
                  <span className="text-xs font-semibold">{col.label}</span>
                </div>
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-full font-mono"
                  style={{
                    backgroundColor: `color-mix(in oklch, ${col.color} 15%, transparent)`,
                    color: col.color,
                  }}
                >
                  {col.hitos.length}
                </span>
              </div>
            </div>

            <div className="space-y-2 flex-1">
              {col.hitos.map((hito) => {
                const vencido = isSlaVencido(hito.slaVenceAt, hito.estado);
                const diasRestantes = diasHasta(hito.slaVenceAt);
                const transitions = TRANSITIONS[hito.estado];
                const isLoading = loading === hito.id;

                return (
                  <div
                    key={hito.id}
                    className={`rounded-lg p-3 border transition-all ${vencido ? "border-[var(--urus-danger)]/40" : "border-border/40"}`}
                  >
                    <div className="flex items-start justify-between gap-1 mb-1.5">
                      <p className="text-xs font-medium leading-tight">{hito.nombre}</p>
                      <span className="text-[9px] text-muted-foreground font-mono shrink-0">
                        #{hito.orden}
                      </span>
                    </div>

                    {hito.slaDias && (
                      <div className="flex items-center gap-1 mb-1.5">
                        <Clock className="h-2.5 w-2.5 text-muted-foreground" />
                        <span className={`text-[9px] font-mono ${vencido ? "text-[var(--urus-danger)] font-bold" : "text-muted-foreground"}`}>
                          {hito.estado === "COMPLETADO"
                            ? "Completado"
                            : diasRestantes !== null
                              ? diasRestantes < 0
                                ? `Vencido (${Math.abs(diasRestantes)}d)`
                                : `${diasRestantes}d restantes`
                              : `SLA: ${hito.slaDias}d`
                          }
                        </span>
                      </div>
                    )}

                    {hito.documentos.length > 0 && (
                      <div className="flex items-center gap-1 mb-1.5">
                        <FileText className="h-2.5 w-2.5 text-muted-foreground" />
                        <span className="text-[9px] text-muted-foreground">
                          {hito.documentos.length} doc{hito.documentos.length > 1 ? "s" : ""}
                        </span>
                      </div>
                    )}

                    {transitions.length > 0 && (
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {transitions.map((target) => {
                          const targetCfg = ESTADO_CONFIG[target];
                          return (
                            <Button
                              key={target}
                              variant="ghost"
                              size="xs"
                              className="h-5 px-1.5 text-[9px] gap-0.5"
                              style={{ color: targetCfg.color }}
                              disabled={isLoading}
                              onClick={() => handleChange(hito.id, target)}
                            >
                              <ChevronRight className="h-2.5 w-2.5" />
                              {targetCfg.label}
                            </Button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {col.hitos.length === 0 && (
                <div className="rounded-lg border border-dashed border-border/30 p-4 flex items-center justify-center">
                  <p className="text-[10px] text-muted-foreground">Sin hitos</p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
