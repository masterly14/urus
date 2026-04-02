"use client";

import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Globe2,
  Loader2,
  MapPin,
  MinusCircle,
  RefreshCw,
  Rocket,
  Shield,
  TrendingUp,
  Users,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatEur, formatDate } from "@/lib/utils/format";
import { MockBadge } from "@/components/bi/mock-badge";
import { useCeoExpansion, useRegenerateExpansion } from "@/lib/hooks/use-ceo-expansion";
import type {
  CeoExpansionRecommendation,
  CriterioExpansion,
  CiudadCandidata,
  ExpansionReadiness,
  CriterioEstado,
} from "@/lib/dashboard/ceo/expansion-types";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_EXPANSION: CeoExpansionRecommendation = {
  readiness_global: "parcial",
  criterios_evaluados: [
    {
      nombre: "Facturación estable",
      estado: "cumplido",
      valor_actual: "28.500 €/mes (tendencia estable 4 meses)",
      umbral: "Tendencia no descendente 3+ meses",
      comentario: "La facturación muestra estabilidad con ligero crecimiento en los últimos 4 meses.",
    },
    {
      nombre: "Margen operativo",
      estado: "cumplido",
      valor_actual: "18,5%",
      umbral: "≥ 15%",
      comentario: "El margen por operación supera el umbral requerido con holgura.",
    },
    {
      nombre: "Cash disponible",
      estado: "cumplido",
      valor_actual: "52.000 €",
      umbral: "≥ 50.000 €",
      comentario: "Cash disponible justo por encima del umbral mínimo para expansión.",
    },
    {
      nombre: "Procesos estables",
      estado: "parcial",
      valor_actual: "3 alertas / 8 comerciales (37,5%), carga 72%",
      umbral: "Alertas < 25%, carga < 80%",
      comentario: "La carga está controlada pero el ratio de alertas supera ligeramente el umbral.",
    },
    {
      nombre: "Capacidad de liderazgo",
      estado: "no_cumplido",
      valor_actual: "1 top_performer en Córdoba, 0 en Málaga/Sevilla",
      umbral: "Top performers en ≥ 2 ciudades",
      comentario: "Solo Córdoba tiene un comercial top_performer. Se necesita desarrollar liderazgo en las otras plazas.",
    },
  ],
  ciudades_recomendadas: [
    {
      ciudad: "Granada",
      puntuacion: 8,
      justificacion:
        "Proximidad geográfica a Córdoba y Málaga, mercado inmobiliario activo con crecimiento del 12% interanual. Ticket medio atractivo en zona centro y Albaicín.",
      inversion_estimada_eur: 45000,
      break_even_meses: 8,
      comerciales_iniciales: 2,
      riesgos: [
        "Competencia local establecida (3 agencias principales)",
        "Mercado más estacional por turismo",
      ],
    },
    {
      ciudad: "Valencia",
      puntuacion: 7,
      justificacion:
        "Tercer mercado inmobiliario de España por volumen. Alta demanda de alquiler y compra. Requiere mayor inversión inicial pero ofrece mayor potencial de escala.",
      inversion_estimada_eur: 85000,
      break_even_meses: 12,
      comerciales_iniciales: 3,
      riesgos: [
        "Alta competencia de grandes redes inmobiliarias",
        "Distancia geográfica mayor (gestión remota)",
        "Coste de vida y salarios más altos",
      ],
    },
  ],
  plan_expansion:
    "Se recomienda preparar la expansión a Granada en un horizonte de 90 días, comenzando con 2 comerciales. " +
    "Antes, resolver el déficit de liderazgo: formar un segundo top_performer en Málaga o Sevilla. " +
    "Valencia queda como segunda fase (6 meses) si Granada demuestra viabilidad.",
  resumen_ejecutivo:
    "La empresa cumple 3 de 5 criterios de expansión (parcial). Se recomienda preparar apertura en Granada tras resolver el déficit de liderazgo en el equipo actual.",
  confidence: 0.72,
  reasoning:
    "3 criterios financieros cumplidos (facturación, margen, cash). Procesos parcial por alertas. Liderazgo insuficiente. Readiness parcial.",
};

const MOCK_GENERATED_AT = "2026-04-01T07:00:00.000Z";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const READINESS_STYLE: Record<ExpansionReadiness, { bg: string; text: string; label: string; border: string }> = {
  apto: {
    bg: "bg-emerald-100 dark:bg-emerald-900/30",
    text: "text-emerald-700 dark:text-emerald-300",
    label: "Apto para expansión",
    border: "border-emerald-300 dark:border-emerald-700",
  },
  parcial: {
    bg: "bg-amber-100 dark:bg-amber-900/30",
    text: "text-amber-700 dark:text-amber-300",
    label: "Readiness parcial",
    border: "border-amber-300 dark:border-amber-700",
  },
  no_apto: {
    bg: "bg-red-100 dark:bg-red-900/30",
    text: "text-red-700 dark:text-red-300",
    label: "No apto para expansión",
    border: "border-red-300 dark:border-red-700",
  },
};

const CRITERIO_ICON: Record<CriterioEstado, typeof CheckCircle2> = {
  cumplido: CheckCircle2,
  parcial: MinusCircle,
  no_cumplido: AlertTriangle,
};

const CRITERIO_COLOR: Record<CriterioEstado, string> = {
  cumplido: "text-emerald-600 dark:text-emerald-400",
  parcial: "text-amber-600 dark:text-amber-400",
  no_cumplido: "text-red-500 dark:text-red-400",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ReadinessCard({ readiness, resumen, generatedAt }: {
  readiness: ExpansionReadiness;
  resumen: string;
  generatedAt: string | null;
}) {
  const style = READINESS_STYLE[readiness];
  return (
    <Card className={cn("border-2", style.border)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5" />
            Evaluación de Expansión
          </CardTitle>
          <Badge className={cn(style.bg, style.text, "border-0 text-sm")}>
            {style.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm leading-relaxed">{resumen}</p>
        {generatedAt && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Evaluado: {formatDate(generatedAt)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function CriteriosCard({ criterios }: { criterios: CriterioExpansion[] }) {
  const cumplidos = criterios.filter((c) => c.estado === "cumplido").length;
  const total = criterios.length;
  const pct = total > 0 ? (cumplidos / total) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Rocket className="h-5 w-5 text-primary" />
          Checklist de Readiness
        </CardTitle>
        <CardDescription>
          {cumplidos} de {total} criterios cumplidos
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm font-medium">
            <span>Progreso</span>
            <span>{pct.toFixed(0)}%</span>
          </div>
          <Progress value={pct} className="h-2" />
        </div>

        <div className="space-y-4">
          {criterios.map((c, i) => {
            const Icon = CRITERIO_ICON[c.estado];
            return (
              <div key={i} className="space-y-1">
                <div className="flex items-start gap-2">
                  <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", CRITERIO_COLOR[c.estado])} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{c.nombre}</p>
                      <Badge
                        variant={c.estado === "cumplido" ? "default" : c.estado === "parcial" ? "secondary" : "destructive"}
                        className="text-[10px] shrink-0"
                      >
                        {c.estado === "cumplido" ? "Cumplido" : c.estado === "parcial" ? "Parcial" : "No cumplido"}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex justify-between gap-2">
                      <span>Actual: {c.valor_actual}</span>
                      <span className="shrink-0">Umbral: {c.umbral}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 italic">{c.comentario}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function CiudadCard({ ciudad }: { ciudad: CiudadCandidata }) {
  return (
    <Card className="border-l-4 border-l-primary shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 p-2 rounded-full">
              <MapPin className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{ciudad.ciudad}</CardTitle>
            </div>
          </div>
          <Badge variant="outline" className="text-lg font-bold gap-1 px-3 py-1">
            {ciudad.puntuacion}/10
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">{ciudad.justificacion}</p>

        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-2 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground">Inversión</p>
            <p className="text-sm font-bold">{formatEur(ciudad.inversion_estimada_eur)}</p>
          </div>
          <div className="text-center p-2 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground">Break-even</p>
            <p className="text-sm font-bold">{ciudad.break_even_meses} meses</p>
          </div>
          <div className="text-center p-2 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground">Equipo inicial</p>
            <p className="text-sm font-bold flex items-center justify-center gap-1">
              <Users className="h-3 w-3" />
              {ciudad.comerciales_iniciales}
            </p>
          </div>
        </div>

        {ciudad.riesgos.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Riesgos:
            </p>
            <ul className="text-xs text-muted-foreground space-y-0.5 pl-4">
              {ciudad.riesgos.map((r, i) => (
                <li key={i} className="list-disc">{r}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PlanCard({ plan, confidence, reasoning }: {
  plan: string;
  confidence: number;
  reasoning: string;
}) {
  return (
    <Card className="bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-950/20 dark:to-indigo-950/20 border-violet-200 dark:border-violet-800">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-violet-700 dark:text-violet-300">
          <TrendingUp className="h-5 w-5" />
          Plan de Expansión
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-relaxed text-violet-900/80 dark:text-violet-100/80">
          {plan}
        </p>
        <div className="flex items-center gap-3">
          <div className="w-full bg-violet-200/50 dark:bg-violet-800/30 rounded-full h-2">
            <div
              className={cn(
                "h-2 rounded-full",
                confidence >= 0.7 ? "bg-emerald-500" : confidence >= 0.4 ? "bg-amber-500" : "bg-red-500",
              )}
              style={{ width: `${(confidence * 100).toFixed(0)}%` }}
            />
          </div>
          <span className="text-xs font-mono font-bold min-w-[3rem] text-right text-violet-700 dark:text-violet-300">
            {(confidence * 100).toFixed(0)}%
          </span>
        </div>
        <p className="text-xs text-violet-600/60 dark:text-violet-400/60">{reasoning}</p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ExpansionDashboard() {
  const searchParams = useSearchParams();
  const useMock = searchParams.get("mock") === "1";

  const { data, generatedAt, loading, error, refetch } = useCeoExpansion();
  const { regenerate, loading: regenerating } = useRegenerateExpansion();

  const expansion = useMock ? MOCK_EXPANSION : data;
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

  if (!expansion) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-4">
          <Globe2 className="h-12 w-12 text-muted-foreground mx-auto" />
          <div>
            <p className="font-medium">Sin evaluación de expansión</p>
            <p className="text-sm text-muted-foreground mt-1">
              Genera la primera evaluación de readiness para expansión geográfica.
            </p>
          </div>
          <Button onClick={handleRegenerate} disabled={regenerating} className="gap-2">
            {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            Evaluar expansión
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <MockBadge show={useMock} />

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
          Reevaluar expansión
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ReadinessCard
          readiness={expansion.readiness_global}
          resumen={expansion.resumen_ejecutivo}
          generatedAt={timestamp}
        />
        <PlanCard
          plan={expansion.plan_expansion}
          confidence={expansion.confidence}
          reasoning={expansion.reasoning}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <CriteriosCard criterios={expansion.criterios_evaluados} />
        </div>

        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Globe2 className="h-5 w-5" />
            Ciudades Recomendadas ({expansion.ciudades_recomendadas.length})
          </h2>
          {expansion.ciudades_recomendadas.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <MapPin className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No se recomiendan ciudades para expansión en este momento.
                  {expansion.readiness_global === "no_apto" &&
                    " Es necesario estabilizar los criterios de readiness primero."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {expansion.ciudades_recomendadas.map((c, i) => (
                <CiudadCard key={i} ciudad={c} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
