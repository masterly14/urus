"use client";

import { Badge } from "@/components/ui/badge";
import { Shield, CheckCircle2, Clock, AlertTriangle, HelpCircle } from "lucide-react";

export type ColaboradorClasificacion =
  | "partner_estrategico"
  | "funcional"
  | "lento"
  | "critico"
  | "sin_datos";

const CONFIG: Record<ColaboradorClasificacion, {
  label: string;
  color: string;
  icon: typeof Shield;
}> = {
  partner_estrategico: { label: "Partner Estratégico", color: "var(--urus-success)", icon: Shield },
  funcional: { label: "Funcional", color: "var(--urus-info)", icon: CheckCircle2 },
  lento: { label: "Lento", color: "var(--urus-warning)", icon: Clock },
  critico: { label: "Crítico", color: "var(--urus-danger)", icon: AlertTriangle },
  sin_datos: { label: "Sin datos", color: "var(--muted-foreground)", icon: HelpCircle },
};

export function ClasificacionBadge({
  clasificacion,
  size = "default",
}: {
  clasificacion: ColaboradorClasificacion;
  size?: "default" | "sm";
}) {
  const cfg = CONFIG[clasificacion];
  const Icon = cfg.icon;
  const textSize = size === "sm" ? "text-[9px]" : "text-[10px]";

  return (
    <Badge
      variant="outline"
      className={`${textSize} gap-1 px-1.5`}
      style={{
        borderColor: `color-mix(in oklch, ${cfg.color} 40%, transparent)`,
        color: cfg.color,
        backgroundColor: `color-mix(in oklch, ${cfg.color} 8%, transparent)`,
      }}
    >
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}
