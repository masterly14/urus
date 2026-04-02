"use client";

import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  Clock,
  Coins,
  Loader2,
  PieChart,
  RefreshCw,
  TrendingUp,
  Zap,
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
import { formatEur, formatDate } from "@/lib/utils/format";
import { MockBadge } from "@/components/bi/mock-badge";
import { useCeoFinanciero, useRegenerateFinanciero } from "@/lib/hooks/use-ceo-financiero";
import type {
  CeoFinancialRecommendation,
  AutomationRoi,
  ReinversionItem,
  SemaforoFinanciero,
} from "@/lib/dashboard/ceo/financial-types";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_FINANCIAL: CeoFinancialRecommendation = {
  costes_fijos_eur: 62000,
  costes_variables_eur: 28000,
  coste_por_operacion_eur: 12857,
  ratio_fijo_variable: 0.69,
  automatizaciones: [
    { nombre: "Cadencia automática postventa", coste_mensual_eur: 50, ahorro_mensual_eur: 500, roi_percent: 900 },
    { nombre: "Sistema alertas comerciales", coste_mensual_eur: 30, ahorro_mensual_eur: 250, roi_percent: 733 },
    { nombre: "Firma digital in-house", coste_mensual_eur: 15, ahorro_mensual_eur: 385, roi_percent: 2567 },
    { nombre: "Scoring automático de leads", coste_mensual_eur: 40, ahorro_mensual_eur: 375, roi_percent: 838 },
  ],
  roi_automatizaciones_total: 693,
  capacidad_reinversion_eur: 35000,
  recomendaciones: [
    {
      categoria: "tecnologia",
      importe_eur: 12000,
      justificacion:
        "Invertir en CRM avanzado con IA para mejorar la gestión de leads. El scoring actual ahorra 375€/mes, un módulo predictivo duplicaría el ahorro.",
      prioridad: "alta",
      horizonte_meses: 3,
    },
    {
      categoria: "talento",
      importe_eur: 8000,
      justificacion:
        "Contratar 1 comercial junior para Málaga, donde la carga media supera el 85% y la rentabilidad/comercial justifica la inversión.",
      prioridad: "alta",
      horizonte_meses: 2,
    },
    {
      categoria: "marketing",
      importe_eur: 6000,
      justificacion:
        "Campaña de captación digital focalizada en Sevilla para incrementar leads de calidad. ROI esperado > 150% basado en conversión actual.",
      prioridad: "media",
      horizonte_meses: 6,
    },
    {
      categoria: "formacion",
      importe_eur: 3000,
      justificacion:
        "Programa de formación en técnicas de cierre para comerciales bajo_rendimiento. Impacto esperado: +15% conversión.",
      prioridad: "media",
      horizonte_meses: 4,
    },
  ],
  semaforo_financiero: "verde",
  resumen_ejecutivo:
    "La estructura de costes es saludable con ratio coste/revenue del 58%. Se recomienda reinvertir 29.000 € en tecnología, talento y marketing para acelerar el crecimiento.",
  confidence: 0.82,
  reasoning:
    "Datos financieros completos de 6 meses. Costes fijos 69% del total (dentro de rango). ROI de automatizaciones excelente (693% medio). Capacidad de reinversión de 35.000 €.",
};

const MOCK_GENERATED_AT = "2026-04-01T07:00:00.000Z";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEMAFORO_STYLE: Record<SemaforoFinanciero, { bg: string; text: string; label: string; border: string }> = {
  verde: {
    bg: "bg-emerald-100 dark:bg-emerald-900/30",
    text: "text-emerald-700 dark:text-emerald-300",
    label: "Finanzas saludables",
    border: "border-emerald-300 dark:border-emerald-700",
  },
  amarillo: {
    bg: "bg-amber-100 dark:bg-amber-900/30",
    text: "text-amber-700 dark:text-amber-300",
    label: "Precaución financiera",
    border: "border-amber-300 dark:border-amber-700",
  },
  rojo: {
    bg: "bg-red-100 dark:bg-red-900/30",
    text: "text-red-700 dark:text-red-300",
    label: "Alerta financiera",
    border: "border-red-300 dark:border-red-700",
  },
};

const PRIORIDAD_VARIANT: Record<ReinversionItem["prioridad"], "default" | "secondary" | "outline"> = {
  alta: "default",
  media: "secondary",
  baja: "outline",
};

const CATEGORIA_LABEL: Record<ReinversionItem["categoria"], string> = {
  tecnologia: "Tecnología",
  talento: "Talento",
  marketing: "Marketing",
  formacion: "Formación",
  infraestructura: "Infraestructura",
  expansion: "Expansión",
};


// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCard({
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
            Generado: {formatDate(generatedAt)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function CostesKpiCards({ data }: { data: CeoFinancialRecommendation }) {
  const total = data.costes_fijos_eur + data.costes_variables_eur;
  const fijosPct = total > 0 ? (data.costes_fijos_eur / total) * 100 : 0;

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg">
              <PieChart className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Costes fijos</p>
              <p className="text-xl font-bold">{formatEur(data.costes_fijos_eur)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="bg-orange-100 dark:bg-orange-900/30 p-2 rounded-lg">
              <BarChart3 className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Costes variables</p>
              <p className="text-xl font-bold">{formatEur(data.costes_variables_eur)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="bg-purple-100 dark:bg-purple-900/30 p-2 rounded-lg">
              <Coins className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Coste/operación</p>
              <p className="text-xl font-bold">{formatEur(data.coste_por_operacion_eur)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Ratio fijo/variable</p>
              <p className="text-sm font-bold">{(data.ratio_fijo_variable * 100).toFixed(0)}%</p>
            </div>
            <Progress value={fijosPct} className="h-2" />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Fijos {fijosPct.toFixed(0)}%</span>
              <span>Variables {(100 - fijosPct).toFixed(0)}%</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AutomationTable({ items, roiTotal }: { items: AutomationRoi[]; roiTotal: number }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-5 w-5 text-amber-500" />
            ROI de Automatizaciones
          </CardTitle>
          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-0">
            ROI medio: {roiTotal.toFixed(0)}%
          </Badge>
        </div>
        <CardDescription>Retorno de inversión de los sistemas automatizados</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
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
            {items.map((a, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{a.nombre}</TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {formatEur(a.coste_mensual_eur)}
                </TableCell>
                <TableCell className="text-right text-emerald-600 dark:text-emerald-400 font-medium">
                  {formatEur(a.ahorro_mensual_eur)}
                </TableCell>
                <TableCell className="text-right">
                  <Badge
                    variant="outline"
                    className={cn(
                      a.roi_percent >= 500
                        ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                        : a.roi_percent >= 200
                          ? "border-amber-500 text-amber-600 dark:text-amber-400"
                          : "border-red-500 text-red-600 dark:text-red-400",
                    )}
                  >
                    {a.roi_percent.toFixed(0)}%
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function ReinversionCards({
  recomendaciones,
  capacidad,
}: {
  recomendaciones: ReinversionItem[];
  capacidad: number;
}) {
  const totalRecomendado = recomendaciones.reduce((sum, r) => sum + r.importe_eur, 0);
  const usoPct = capacidad > 0 ? (totalRecomendado / capacidad) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Recomendaciones de Reinversión
        </h2>
        <div className="text-right">
          <p className="text-sm font-medium">
            {formatEur(totalRecomendado)} / {formatEur(capacidad)}
          </p>
          <p className="text-xs text-muted-foreground">
            {usoPct.toFixed(0)}% de capacidad utilizada
          </p>
        </div>
      </div>

      <Progress value={Math.min(usoPct, 100)} className="h-2" />

      <div className="grid gap-4 md:grid-cols-2">
        {recomendaciones.map((r, i) => (
          <Card key={i} className="border-l-4 border-l-primary shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant={PRIORIDAD_VARIANT[r.prioridad]} className="text-[10px]">
                    {r.prioridad}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {CATEGORIA_LABEL[r.categoria]}
                  </Badge>
                </div>
                <span className="text-lg font-bold">{formatEur(r.importe_eur)}</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm leading-relaxed">{r.justificacion}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Horizonte: {r.horizonte_meses} meses
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ConfidenceFooter({ confidence, reasoning }: { confidence: number; reasoning: string }) {
  return (
    <Card className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950/20 dark:to-slate-900/20">
      <CardContent className="py-4 space-y-2">
        <div className="flex items-center gap-3">
          <p className="text-xs font-medium text-muted-foreground">Confianza del análisis:</p>
          <div className="flex-1 bg-slate-200/50 dark:bg-slate-800/30 rounded-full h-2">
            <div
              className={cn(
                "h-2 rounded-full",
                confidence >= 0.7 ? "bg-emerald-500" : confidence >= 0.4 ? "bg-amber-500" : "bg-red-500",
              )}
              style={{ width: `${(confidence * 100).toFixed(0)}%` }}
            />
          </div>
          <span className="text-xs font-mono font-bold min-w-[3rem] text-right">
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

export default function ReinvestmentDashboard() {
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
          <Banknote className="h-12 w-12 text-muted-foreground mx-auto" />
          <div>
            <p className="font-medium">Sin análisis financiero</p>
            <p className="text-sm text-muted-foreground mt-1">
              Genera el primer análisis de control financiero y recomendaciones de reinversión.
            </p>
          </div>
          <Button onClick={handleRegenerate} disabled={regenerating} className="gap-2">
            {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
            Analizar finanzas
          </Button>
        </CardContent>
      </Card>
    );
  }

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
          Reevaluar finanzas
        </Button>
      </div>

      <SummaryCard
        semaforo={financial.semaforo_financiero}
        resumen={financial.resumen_ejecutivo}
        generatedAt={timestamp}
      />

      <CostesKpiCards data={financial} />

      <AutomationTable items={financial.automatizaciones} roiTotal={financial.roi_automatizaciones_total} />

      <ReinversionCards
        recomendaciones={financial.recomendaciones}
        capacidad={financial.capacidad_reinversion_eur}
      />

      <ConfidenceFooter confidence={financial.confidence} reasoning={financial.reasoning} />
    </div>
  );
}
