"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Brain,
  Coins,
  FileBarChart,
  Lightbulb,
  Loader2,
  RefreshCw,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  Users,
  MapPin,
  GraduationCap,
  Target,
  Wallet,
  Search,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils/format";
import { MockBadge } from "@/components/bi/mock-badge";
import { useCeoDiagnostic, useRegenerateDiagnostic } from "@/lib/hooks/use-ceo-diagnostic";
import type {
  CeoDiagnosticRecommendation,
  CeoDiagnosticItem,
  CeoDiagnosticTipo,
  CeoDiagnosticSemaforo,
} from "@/lib/dashboard/ceo/diagnostic-types";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_DIAGNOSTIC: CeoDiagnosticRecommendation = {
  diagnostico_general:
    "Urus Capital Group muestra una facturación mensual de 28.500 € con un EBITDA de 8.200 € (margen 28,8%). " +
    "Córdoba lidera en rentabilidad por comercial (4.800 €/mes) pero Málaga presenta saturación con carga al 91%. " +
    "Sevilla tiene el mayor coste de oportunidad por leads perdidos (6.200 €). El equipo cuenta con 8 comerciales activos con 3 alertas abiertas.",
  recomendaciones: [
    {
      tipo: "contratar",
      ciudad: "Málaga",
      mensaje:
        "La carga media en Málaga alcanza el 91%, superando el umbral del 85%. Los 3 comerciales actuales gestionan 47 propiedades activas cada uno.",
      datos_soporte: [
        "Carga media Málaga: 91%",
        "Propiedades/comercial: 47",
        "Facturación Málaga: 12.300 €/mes",
      ],
      accion_sugerida:
        "Incorporar 1 comercial junior en Málaga para reducir la carga al ~68% y captar leads que actualmente se pierden.",
      impacto_esperado:
        "+4.100 €/mes de facturación estimada al dejar de perder leads por saturación.",
      prioridad: "alta",
    },
    {
      tipo: "intervenir_proceso",
      ciudad: "Sevilla",
      mensaje:
        "Sevilla tiene una tasa de leads perdidos del 45% (la más alta) con una conversión lead→visita del 22%, muy por debajo del 35% de Córdoba.",
      datos_soporte: [
        "Leads perdidos Sevilla: 45%",
        "Conversión L→V: 22%",
        "Coste oportunidad: 6.200 €/mes",
      ],
      accion_sugerida:
        "Auditar el proceso de contacto inicial en Sevilla: tiempos de respuesta, calidad de la primera llamada y criterios de cualificación.",
      impacto_esperado:
        "Reducir leads perdidos al 30% generaría ~3.100 € adicionales/mes.",
      prioridad: "alta",
    },
    {
      tipo: "formacion",
      ciudad: null,
      mensaje:
        "2 comerciales con bajo rendimiento estructural muestran conversiones visita→cierre inferiores al 10% de forma consistente.",
      datos_soporte: [
        "Comerciales afectados: 2/8",
        "Conv. V→C media del equipo: 18%",
        "Conv. V→C afectados: <10%",
      ],
      accion_sugerida:
        "Programa de formación intensivo de 2 semanas en técnicas de cierre con mentoring de top performers.",
      impacto_esperado:
        "Elevar la conversión de estos 2 comerciales al 14% sumaría ~2.000 €/mes.",
      prioridad: "media",
    },
    {
      tipo: "expandir",
      ciudad: "Córdoba",
      mensaje:
        "Córdoba presenta la mejor rentabilidad por comercial (4.800 €/mes), margen del 31% y cash disponible de 52.000 €. Condiciones ideales para expansión.",
      datos_soporte: [
        "Rentabilidad/comercial: 4.800 €",
        "Margen: 31%",
        "Cash: 52.000 €",
      ],
      accion_sugerida:
        "Evaluar expansión de zona de cobertura en Córdoba capital y municipios cercanos (Lucena, Montilla).",
      impacto_esperado:
        "Potencial de +8.000 €/mes en un horizonte de 3 meses.",
      prioridad: "media",
    },
    {
      tipo: "redistribuir_leads",
      ciudad: null,
      mensaje:
        "El ratio de leads asignados entre el comercial con más carga y el de menos es de 2.8x, indicando un desbalance significativo.",
      datos_soporte: [
        "Máx. leads/comercial: 42",
        "Mín. leads/comercial: 15",
        "Ratio: 2.8x",
      ],
      accion_sugerida:
        "Redistribuir leads para equilibrar la carga a un máximo de 1.5x entre comerciales de la misma ciudad.",
      impacto_esperado:
        "Mayor equidad y reducción del ~20% en leads perdidos por sobrecarga.",
      prioridad: "baja",
    },
  ],
  resumen_ejecutivo:
    "Málaga necesita contratación urgente (carga al 91%) y Sevilla requiere intervención en el proceso de captación (45% leads perdidos). " +
    "Córdoba es la plaza más rentable y tiene condiciones para expandir.",
  semaforo_global: "amarillo",
  confidence: 0.85,
  reasoning:
    "Datos suficientes de 3 ciudades con 8 comerciales activos. Alertas en Málaga por saturación y Sevilla por ineficiencia. Córdoba estable.",
};

const MOCK_GENERATED_AT = "2026-04-01T07:00:00.000Z";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TIPO_CONFIG: Record<CeoDiagnosticTipo, { label: string; icon: typeof Brain; color: string }> = {
  contratar: { label: "Contratación", icon: Users, color: "text-blue-600 dark:text-blue-400" },
  expandir: { label: "Expansión", icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-400" },
  intervenir_proceso: { label: "Intervenir Proceso", icon: AlertTriangle, color: "text-orange-600 dark:text-orange-400" },
  redistribuir_leads: { label: "Redistribución", icon: Target, color: "text-purple-600 dark:text-purple-400" },
  formacion: { label: "Formación", icon: GraduationCap, color: "text-cyan-600 dark:text-cyan-400" },
  ajustar_incentivos: { label: "Incentivos", icon: Wallet, color: "text-amber-600 dark:text-amber-400" },
  reducir_costes: { label: "Reducir Costes", icon: Coins, color: "text-red-600 dark:text-red-400" },
  investigar: { label: "Investigar", icon: Search, color: "text-gray-600 dark:text-gray-400" },
};

const SEMAFORO_STYLE: Record<CeoDiagnosticSemaforo, { bg: string; text: string; label: string }> = {
  verde: { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-300", label: "Buena salud" },
  amarillo: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-300", label: "Atención necesaria" },
  rojo: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300", label: "Intervención urgente" },
};

const PRIORIDAD_VARIANT: Record<string, "destructive" | "secondary" | "outline"> = {
  alta: "destructive",
  media: "secondary",
  baja: "outline",
};


// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SemaforoCard({ semaforo, resumen, generatedAt }: {
  semaforo: CeoDiagnosticSemaforo;
  resumen: string;
  generatedAt: string | null;
}) {
  const style = SEMAFORO_STYLE[semaforo];
  return (
    <Card className={cn("border-2", semaforo === "rojo" ? "border-red-300 dark:border-red-700" : semaforo === "amarillo" ? "border-amber-300 dark:border-amber-700" : "border-emerald-300 dark:border-emerald-700")}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldAlert className="h-5 w-5" />
            Resumen Ejecutivo
          </CardTitle>
          <Badge className={cn(style.bg, style.text, "border-0")}>
            {style.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm leading-relaxed">{resumen}</p>
        {generatedAt && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Generado: {formatDate(generatedAt)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function DiagnosticoCard({ text }: { text: string }) {
  return (
    <Card className="bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-950/20 dark:to-indigo-950/20 border-violet-200 dark:border-violet-800">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-violet-700 dark:text-violet-300">
          <Brain className="h-5 w-5" />
          Diagnóstico General
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed text-violet-900/80 dark:text-violet-100/80">
          {text}
        </p>
      </CardContent>
    </Card>
  );
}

function RecommendationCard({ rec }: { rec: CeoDiagnosticItem }) {
  const config = TIPO_CONFIG[rec.tipo];
  const Icon = config.icon;

  return (
    <Card className="border-l-4 border-l-primary shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={PRIORIDAD_VARIANT[rec.prioridad] ?? "outline"}>
                {rec.prioridad === "alta" ? "Crítico" : rec.prioridad === "media" ? "Importante" : "Sugerencia"}
              </Badge>
              <span className={cn("text-xs uppercase tracking-wider font-semibold flex items-center gap-1", config.color)}>
                <Icon className="h-3 w-3" />
                {config.label}
              </span>
              {rec.ciudad && (
                <Badge variant="outline" className="text-xs gap-1">
                  <MapPin className="h-3 w-3" />
                  {rec.ciudad}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm mb-3">{rec.mensaje}</p>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <span className="font-semibold text-muted-foreground flex items-center gap-1">
              <Lightbulb className="h-3 w-3" /> Acción sugerida:
            </span>
            <p className="pl-4 border-l-2 border-muted">{rec.accion_sugerida}</p>
          </div>
          <div className="space-y-1">
            <span className="font-semibold text-muted-foreground flex items-center gap-1">
              <Coins className="h-3 w-3" /> Impacto esperado:
            </span>
            <p className="font-bold text-emerald-600 dark:text-emerald-400">
              {rec.impacto_esperado}
            </p>
          </div>
        </div>
        {rec.datos_soporte.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {rec.datos_soporte.map((d, i) => (
              <Badge key={i} variant="outline" className="text-xs font-mono">
                {d}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RulesCard() {
  const rules = [
    { rule: "Si carga media > 85% en una ciudad", action: "Recomendar CONTRATAR" },
    { rule: "Si facturación estable + margen >= 15% + cash >= 50K", action: "Recomendar EXPANDIR" },
    { rule: "Si conversión baja + alto volumen de clientes", action: "Recomendar INTERVENIR PROCESO" },
    { rule: "Si comerciales con bajo rendimiento estructural", action: "Recomendar FORMACIÓN" },
    { rule: "Si clientes perdidos > umbral", action: "Recomendar REDISTRIBUIR" },
    { rule: "Si coste operativo / revenue > 80%", action: "Recomendar REDUCIR COSTES" },
    { rule: "Si datos insuficientes", action: "Recomendar INVESTIGAR" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileBarChart className="h-4 w-4" />
          Criterios del Diagnóstico
        </CardTitle>
        <CardDescription>Cómo funciona el diagnóstico automático</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rules.map((r, i) => (
          <div key={i} className="text-sm space-y-0.5">
            <p className="font-medium">{r.rule}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
              {r.action}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ConfidenceCard({ confidence, reasoning }: { confidence: number; reasoning: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          Confianza del Diagnóstico
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-full bg-muted rounded-full h-2.5">
            <div
              className={cn(
                "h-2.5 rounded-full",
                confidence >= 0.7 ? "bg-emerald-500" : confidence >= 0.4 ? "bg-amber-500" : "bg-red-500",
              )}
              style={{ width: `${(confidence * 100).toFixed(0)}%` }}
            />
          </div>
          <span className="text-sm font-mono font-bold min-w-[3rem] text-right">
            {(confidence * 100).toFixed(0)}%
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{reasoning}</p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function PrescriptiveDashboardInner() {
  const searchParams = useSearchParams();
  const useMock = searchParams.get("mock") === "1";

  const { data, generatedAt, loading, error, refetch } = useCeoDiagnostic();
  const { regenerate, loading: regenerating } = useRegenerateDiagnostic();

  const diagnostic = useMock ? MOCK_DIAGNOSTIC : data;
  const timestamp = useMock ? MOCK_GENERATED_AT : generatedAt;
  const isLoading = useMock ? false : loading;

  const handleRegenerate = async () => {
    const result = await regenerate();
    if (result) {
      refetch();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !useMock) {
    return (
      <Card className="border-red-200 dark:border-red-800">
        <CardContent className="py-8 text-center">
          <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={refetch}>
            Reintentar
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!diagnostic) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-4">
          <Brain className="h-12 w-12 text-muted-foreground mx-auto" />
          <div>
            <p className="font-medium">Sin diagnóstico disponible</p>
            <p className="text-sm text-muted-foreground mt-1">
              Genera el primer diagnóstico estratégico con IA.
            </p>
          </div>
          <Button onClick={handleRegenerate} disabled={regenerating} className="gap-2">
            {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
            Generar diagnóstico
          </Button>
        </CardContent>
      </Card>
    );
  }

  const sortedRecs = [...diagnostic.recomendaciones].sort((a, b) => {
    const order = { alta: 0, media: 1, baja: 2 };
    return (order[a.prioridad] ?? 2) - (order[b.prioridad] ?? 2);
  });

  return (
    <div className="space-y-6">
      {useMock && <MockBadge />}

      <div className="flex items-center justify-between">
        <div />
        <Button
          variant="outline"
          size="sm"
          onClick={handleRegenerate}
          disabled={regenerating}
          className="gap-2"
        >
          {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Regenerar diagnóstico
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SemaforoCard
          semaforo={diagnostic.semaforo_global}
          resumen={diagnostic.resumen_ejecutivo}
          generatedAt={timestamp}
        />
        <DiagnosticoCard text={diagnostic.diagnostico_general} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">
            Recomendaciones ({sortedRecs.length})
          </h2>
          <div className="grid gap-4">
            {sortedRecs.map((rec, i) => (
              <RecommendationCard key={i} rec={rec} />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <ConfidenceCard
            confidence={diagnostic.confidence}
            reasoning={diagnostic.reasoning}
          />
          <RulesCard />
        </div>
      </div>
    </div>
  );
}

export default function PrescriptiveDashboard() {
  return (
    <Suspense>
      <PrescriptiveDashboardInner />
    </Suspense>
  );
}
