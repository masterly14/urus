"use client";

import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart2,
  Banknote,
  Bot,
  CheckCircle2,
  Clock,
  Coins,
  Loader2,
  RefreshCw,
  Rocket,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useCeoFinanciero, useRegenerateFinanciero } from "@/lib/hooks/use-ceo-financiero";
import type {
  CeoFinancialRecommendation,
  AutomationRoi,
  ReinversionItem,
  SemaforoFinanciero,
  ReinversionCategoria,
} from "@/lib/dashboard/ceo/financial-types";

// ---------------------------------------------------------------------------
// Mock data (?mock=1)
// ---------------------------------------------------------------------------

const MOCK_FINANCIAL: CeoFinancialRecommendation = {
  costes_fijos_eur: 18500,
  costes_variables_eur: 9800,
  coste_por_operacion_eur: 4700,
  ratio_fijo_variable: 0.65,
  automatizaciones: [
    {
      nombre: "Cadencia automática postventa",
      coste_mensual_eur: 50,
      ahorro_mensual_eur: 500,
      roi_percent: 900,
      comentario: "Ahorra 20 horas/mes al equipo comercial en seguimiento manual.",
    },
    {
      nombre: "Sistema de alertas comerciales",
      coste_mensual_eur: 30,
      ahorro_mensual_eur: 250,
      roi_percent: 733,
      comentario: "Detecta y notifica automáticamente desviaciones de rendimiento.",
    },
    {
      nombre: "Firma digital Signaturit",
      coste_mensual_eur: 80,
      ahorro_mensual_eur: 320,
      roi_percent: 300,
      comentario: "Elimina desplazamientos para firma presencial, acelera cierres.",
    },
    {
      nombre: "Scoring automático de leads",
      coste_mensual_eur: 40,
      ahorro_mensual_eur: 375,
      roi_percent: 838,
      comentario: "Prioriza los leads con mayor probabilidad de cierre automáticamente.",
    },
    {
      nombre: "Recomendaciones de colaboradores IA",
      coste_mensual_eur: 35,
      ahorro_mensual_eur: 210,
      roi_percent: 500,
      comentario: "Genera semanalmente una estrategia de gestión del equipo externo.",
    },
  ],
  roi_automatizaciones_total: 654,
  capacidad_reinversion_eur: 22500,
  recomendaciones: [
    {
      categoria: "equipo",
      importe_eur: 10000,
      justificacion:
        "La carga media del equipo supera el 75%. Contratar 1 comercial en Málaga (ciudad con mayor rentabilidad/comercial) permitiría capturar la demanda no atendida y aliviar la saturación actual.",
      prioridad: "alta",
      horizonte_meses: 2,
    },
    {
      categoria: "tecnologia",
      importe_eur: 7500,
      justificacion:
        "Con un ROI promedio del 654% en las automatizaciones actuales, ampliar la cobertura con un módulo de análisis predictivo de precios (integración Statefox avanzada) generaría retorno en menos de 6 meses.",
      prioridad: "media",
      horizonte_meses: 3,
    },
    {
      categoria: "marketing",
      importe_eur: 5000,
      justificacion:
        "La facturación de Sevilla está por debajo del target en 2 de los últimos 3 meses. Una campaña de captación digital focalizada en la zona norte de la ciudad podría recuperar el pipeline.",
      prioridad: "media",
      horizonte_meses: 1,
    },
  ],
  semaforo_financiero: "amarillo",
  resumen_ejecutivo:
    "La empresa mantiene márgenes positivos con EBITDA estable, pero la estructura de costes está algo rígida (65% fijos). Con 22.500 € disponibles para reinvertir, prioridad en equipo para resolver saturación operativa.",
  confidence: 0.78,
  reasoning:
    "EBITDA positivo y cash suficiente → no rojo. Ratio fijo/variable 0.65 (moderado) y carga equipo alta → amarillo. Reinversión calculada como cash - 3x coste operativo mensual.",
};

const MOCK_GENERATED_AT = "2026-04-01T08:00:00.000Z";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatEur(n: number): string {
  return n.toLocaleString("es-ES") + " €";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const SEMAFORO_STYLE: Record<SemaforoFinanciero, { bg: string; text: string; label: string; border: string; dot: string }> = {
  verde: {
    bg: "bg-emerald-100 dark:bg-emerald-900/30",
    text: "text-emerald-700 dark:text-emerald-300",
    label: "Salud financiera óptima",
    border: "border-emerald-300 dark:border-emerald-700",
    dot: "bg-emerald-500",
  },
  amarillo: {
    bg: "bg-amber-100 dark:bg-amber-900/30",
    text: "text-amber-700 dark:text-amber-300",
    label: "Zona de precaución",
    border: "border-amber-300 dark:border-amber-700",
    dot: "bg-amber-500",
  },
  rojo: {
    bg: "bg-red-100 dark:bg-red-900/30",
    text: "text-red-700 dark:text-red-300",
    label: "Atención urgente requerida",
    border: "border-red-300 dark:border-red-700",
    dot: "bg-red-500",
  },
};

const CATEGORIA_LABEL: Record<ReinversionCategoria, string> = {
  tecnologia: "Tecnología",
  equipo: "Equipo",
  ciudad: "Nueva Ciudad",
  marketing: "Marketing",
  formacion: "Formación",
};

const CATEGORIA_ICON: Record<ReinversionCategoria, typeof Coins> = {
  tecnologia: Bot,
  equipo: CheckCircle2,
  ciudad: TrendingUp,
  marketing: ArrowUpRight,
  formacion: BarChart2,
};

const PRIORIDAD_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  alta: "destructive",
  media: "secondary",
  baja: "outline",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SemaforoCard({
  semaforo,
  resumen,
  generatedAt,
}: {
  semaforo: SemaforoFinanciero;
  resumen: string;
  generatedAt: string | null;
}) {
  const style = SEMAFORO_STYLE[semaforo];
  return (
    <Card className={cn("border-2", style.border)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Banknote className="h-5 w-5" />
            Control Financiero
          </CardTitle>
          <Badge className={cn(style.bg, style.text, "border-0 text-sm gap-1.5")}>
            <span className={cn("inline-block h-2 w-2 rounded-full", style.dot)} />
            {style.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm leading-relaxed">{resumen}</p>
        {generatedAt && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Analizado: {formatDate(generatedAt)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof Coins;
  highlight?: "green" | "amber" | "red";
}) {
  const color =
    highlight === "green"
      ? "text-emerald-600 dark:text-emerald-400"
      : highlight === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : highlight === "red"
          ? "text-red-600 dark:text-red-400"
          : "text-foreground";
  return (
    <Card>
      <CardContent className="pt-6 pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className={cn("text-2xl font-bold font-mono", color)}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className="bg-muted p-2 rounded-lg">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CostesCard({
  fijos,
  variables,
  ratio,
}: {
  fijos: number;
  variables: number;
  ratio: number;
}) {
  const total = fijos + variables;
  const pct = ratio * 100;
  const rigidez = pct > 70 ? "alta" : pct > 50 ? "media" : "baja";
  const rigidezColor =
    rigidez === "alta"
      ? "text-red-600 dark:text-red-400"
      : rigidez === "media"
        ? "text-amber-600 dark:text-amber-400"
        : "text-emerald-600 dark:text-emerald-400";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingDown className="h-5 w-5 text-primary" />
          Estructura de Costes
        </CardTitle>
        <CardDescription>Desglose fijo/variable del coste operativo mensual</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-primary inline-block" />
              Costes Fijos
            </span>
            <span className="font-mono font-semibold">{formatEur(fijos)}</span>
          </div>
          <Progress value={pct} className="h-3" />
          <div className="flex justify-between text-sm">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-muted-foreground/40 inline-block" />
              Costes Variables
            </span>
            <span className="font-mono font-semibold">{formatEur(variables)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Total mensual</p>
            <p className="font-bold font-mono text-sm">{formatEur(total)}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Rigidez</p>
            <p className={cn("font-bold text-sm capitalize", rigidezColor)}>
              {pct.toFixed(0)}% fijo — {rigidez}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AutomacionesCard({ automatizaciones, roiTotal }: {
  automatizaciones: AutomationRoi[];
  roiTotal: number;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-5 w-5 text-primary" />
            ROI de Automatizaciones
          </CardTitle>
          <Badge variant="outline" className="font-mono gap-1 text-sm">
            <TrendingUp className="h-3 w-3 text-emerald-500" />
            {roiTotal.toFixed(0)}% total
          </Badge>
        </div>
        <CardDescription>Retorno de cada automatización activa en el sistema</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Automatización</TableHead>
              <TableHead className="text-right">Coste/mes</TableHead>
              <TableHead className="text-right">Ahorro/mes</TableHead>
              <TableHead className="text-right">ROI</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {automatizaciones.map((a, i) => (
              <TableRow key={i}>
                <TableCell>
                  <div>
                    <p className="text-sm font-medium">{a.nombre}</p>
                    <p className="text-xs text-muted-foreground">{a.comentario}</p>
                  </div>
                </TableCell>
                <TableCell className="text-right text-muted-foreground font-mono text-sm">
                  {formatEur(a.coste_mensual_eur)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-emerald-600 dark:text-emerald-400">
                  {formatEur(a.ahorro_mensual_eur)}
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-bold font-mono text-sm text-emerald-600 dark:text-emerald-400">
                    {a.roi_percent.toFixed(0)}%
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ReinversionCard({ item, totalCapacidad }: {
  item: ReinversionItem;
  totalCapacidad: number;
}) {
  const Icon = CATEGORIA_ICON[item.categoria];
  const pct = totalCapacidad > 0 ? (item.importe_eur / totalCapacidad) * 100 : 0;

  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 p-1.5 rounded-md">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">
                {CATEGORIA_LABEL[item.categoria]}
              </CardTitle>
              <p className="text-xs text-muted-foreground">{item.horizonte_meses} mes{item.horizonte_meses !== 1 ? "es" : ""}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="font-bold font-mono text-sm">{formatEur(item.importe_eur)}</span>
            <Badge variant={PRIORIDAD_VARIANT[item.prioridad]} className="text-[10px]">
              Prioridad {item.prioridad}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground leading-relaxed">{item.justificacion}</p>
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>% de capacidad usada</span>
            <span>{pct.toFixed(0)}%</span>
          </div>
          <Progress value={pct} className="h-1.5" />
        </div>
      </CardContent>
    </Card>
  );
}

function AnalisisCard({ confidence, reasoning }: {
  confidence: number;
  reasoning: string;
}) {
  return (
    <Card className="bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-950/20 dark:to-indigo-950/20 border-violet-200 dark:border-violet-800">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-violet-700 dark:text-violet-300 text-base">
          <BarChart2 className="h-4 w-4" />
          Razonamiento del Análisis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs leading-relaxed text-violet-900/70 dark:text-violet-100/70">
          {reasoning}
        </p>
        <div className="flex items-center gap-3">
          <div className="w-full bg-violet-200/50 dark:bg-violet-800/30 rounded-full h-2">
            <div
              className={cn(
                "h-2 rounded-full",
                confidence >= 0.7
                  ? "bg-emerald-500"
                  : confidence >= 0.4
                    ? "bg-amber-500"
                    : "bg-red-500",
              )}
              style={{ width: `${(confidence * 100).toFixed(0)}%` }}
            />
          </div>
          <span className="text-xs font-mono font-bold min-w-[3rem] text-right text-violet-700 dark:text-violet-300">
            {(confidence * 100).toFixed(0)}%
          </span>
        </div>
        <p className="text-[10px] text-violet-500/60 dark:text-violet-400/60">
          Índice de confianza del análisis IA
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function FinancieroDashboard() {
  const searchParams = useSearchParams();
  const useMock = searchParams.get("mock") === "1";

  const { data, generatedAt, loading, error, refetch } = useCeoFinanciero();
  const { regenerate, loading: regenerating } = useRegenerateFinanciero();

  const financial = useMock ? MOCK_FINANCIAL : data;
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

  if (!financial) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-4">
          <Coins className="h-12 w-12 text-muted-foreground mx-auto" />
          <div>
            <p className="font-medium">Sin análisis financiero</p>
            <p className="text-sm text-muted-foreground mt-1">
              Genera el primer análisis de control financiero para ver costes, ROI y recomendaciones de reinversión.
            </p>
          </div>
          <Button onClick={handleRegenerate} disabled={regenerating} className="gap-2">
            {regenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="h-4 w-4" />
            )}
            Generar análisis financiero
          </Button>
        </CardContent>
      </Card>
    );
  }

  const totalRecomendado = financial.recomendaciones.reduce(
    (acc, r) => acc + r.importe_eur,
    0,
  );

  return (
    <div className="space-y-6">
      {useMock && (
        <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
          Modo demo (mock=1)
        </Badge>
      )}

      <div className="flex items-center justify-between">
        <div />
        <Button
          variant="outline"
          size="sm"
          onClick={handleRegenerate}
          disabled={regenerating}
          className="gap-2"
        >
          {regenerating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Reevaluar finanzas
        </Button>
      </div>

      {/* Semáforo + KPIs principales */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="md:col-span-2 lg:col-span-1">
          <SemaforoCard
            semaforo={financial.semaforo_financiero}
            resumen={financial.resumen_ejecutivo}
            generatedAt={timestamp}
          />
        </div>
        <KpiCard
          label="Capacidad de Reinversión"
          value={formatEur(financial.capacidad_reinversion_eur)}
          sub="Cash seguro disponible (cash - 3× costes op.)"
          icon={Banknote}
          highlight={
            financial.capacidad_reinversion_eur > 20000
              ? "green"
              : financial.capacidad_reinversion_eur > 0
                ? "amber"
                : "red"
          }
        />
        <KpiCard
          label="Coste por Operación"
          value={formatEur(financial.coste_por_operacion_eur)}
          sub="Coste operativo / operaciones cerradas"
          icon={BarChart2}
        />
      </div>

      {/* Costes fijos/variables + ROI automatizaciones */}
      <div className="grid gap-6 lg:grid-cols-2">
        <CostesCard
          fijos={financial.costes_fijos_eur}
          variables={financial.costes_variables_eur}
          ratio={financial.ratio_fijo_variable}
        />
        <AutomacionesCard
          automatizaciones={financial.automatizaciones}
          roiTotal={financial.roi_automatizaciones_total}
        />
      </div>

      {/* Recomendaciones de reinversión */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Coins className="h-5 w-5" />
            Plan de Reinversión
          </h2>
          <Badge variant="outline" className="font-mono">
            {formatEur(financial.capacidad_reinversion_eur)} disponibles ·{" "}
            {formatEur(totalRecomendado)} distribuidos
          </Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {financial.recomendaciones.map((r, i) => (
            <ReinversionCard
              key={i}
              item={r}
              totalCapacidad={financial.capacidad_reinversion_eur}
            />
          ))}
        </div>
      </div>

      {/* Razonamiento IA */}
      <AnalisisCard
        confidence={financial.confidence}
        reasoning={financial.reasoning}
      />
    </div>
  );
}
