"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  HeartPulse,
  ThermometerSun,
  Users,
  Zap,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types (mirror de MentalHealthOverview en lib/dashboard/mental-health/queries)
// ---------------------------------------------------------------------------

interface FlujoDistribucion {
  bloqueo: number;
  preparacion: number;
  descarga: number;
  enfoque: number;
  crecimiento: number;
}

interface AlertasActivas {
  energy_drop: number;
  recurrent_block: number;
  overload: number;
}

interface MentalHealthOverview {
  sesionesUltimos30d: number;
  comercialesActivos: number;
  energiaMediaEquipo: number | null;
  flujoDistribucion: FlujoDistribucion;
  alertasActivas: AlertasActivas;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function energiaLabel(avg: number | null): { label: string; color: string } {
  if (avg === null) return { label: "Sin datos", color: "text-muted-foreground" };
  if (avg >= 4) return { label: "Alta", color: "text-urus-success" };
  if (avg >= 3) return { label: "Media", color: "text-urus-warning" };
  return { label: "Baja", color: "text-urus-danger" };
}

const FLUJO_META: Record<
  keyof FlujoDistribucion,
  { label: string; color: string }
> = {
  bloqueo: { label: "Bloqueo", color: "bg-urus-danger" },
  preparacion: { label: "Preparación", color: "bg-blue-500" },
  descarga: { label: "Descarga emocional", color: "bg-orange-500" },
  enfoque: { label: "Enfoque", color: "bg-purple-500" },
  crecimiento: { label: "Crecimiento", color: "bg-urus-success" },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HumanCapitalDashboard() {
  const [data, setData] = useState<MentalHealthOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/mental-health")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ ok: boolean; data: MentalHealthOverview }>;
      })
      .then((json) => {
        setData(json.data);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        console.error("[capital-humano] Error fetching overview:", msg);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Cargando datos de capital humano…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64 text-urus-danger text-sm">
        No se pudieron cargar los datos. Inténtalo de nuevo.
      </div>
    );
  }

  const totalAlertas =
    data.alertasActivas.energy_drop +
    data.alertasActivas.recurrent_block +
    data.alertasActivas.overload;

  const energia = energiaLabel(data.energiaMediaEquipo);

  const totalFlujos = Object.values(data.flujoDistribucion).reduce(
    (a, b) => a + b,
    0,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Capital Humano"
        description="Estado emocional y riesgos operativos del equipo comercial."
        breadcrumbs={[
          { label: "Inicio", href: "/platform" },
          { label: "BI", href: "/platform/bi" },
          { label: "Capital Humano" },
        ]}
      />
      {/* ── KPIs ── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Sesiones último mes
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.sesionesUltimos30d}</div>
            <p className="text-xs text-muted-foreground">
              Conversaciones con el Coach IA
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Comerciales activos
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.comercialesActivos}</div>
            <p className="text-xs text-muted-foreground">
              Usaron el bot en los últimos 30 días
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Energía media del equipo
            </CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", energia.color)}>
              {energia.label}
            </div>
            <p className="text-xs text-muted-foreground">
              {data.energiaMediaEquipo !== null
                ? `${data.energiaMediaEquipo.toFixed(1)}/5 (promedio bot)`
                : "Sin datos suficientes"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Alertas de riesgo
            </CardTitle>
            <HeartPulse className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                "text-2xl font-bold",
                totalAlertas > 0 ? "text-urus-danger" : "text-urus-success",
              )}
            >
              {totalAlertas}
            </div>
            <p className="text-xs text-muted-foreground">
              {totalAlertas > 0
                ? "Requieren atención del CEO"
                : "Sin riesgos activos"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Distribución de flujos + Alertas ── */}
      <div className="grid gap-4 md:grid-cols-7">
        {/* Distribución de flujos */}
        <Card className="md:col-span-4">
          <CardHeader>
            <CardTitle>Distribución de flujos</CardTitle>
            <CardDescription>
              Por qué acuden los comerciales al Coach IA (últimos 30 días).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {totalFlujos === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Sin sesiones registradas en los últimos 30 días.
              </p>
            ) : (
              <div className="space-y-5">
                {(
                  Object.entries(data.flujoDistribucion) as [
                    keyof FlujoDistribucion,
                    number,
                  ][]
                ).map(([key, count]) => {
                  const meta = FLUJO_META[key];
                  const pct = totalFlujos > 0 ? (count / totalFlujos) * 100 : 0;

                  return (
                    <div key={key} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{meta.label}</span>
                        <span className="text-muted-foreground">
                          {count} ({Math.round(pct)}%)
                        </span>
                      </div>
                      <Progress
                        value={pct}
                        className={cn(
                          "h-2",
                          key === "bloqueo" &&
                            "bg-urus-danger/10 [&>div]:bg-urus-danger",
                          key === "preparacion" &&
                            "bg-blue-100 [&>div]:bg-blue-500",
                          key === "descarga" &&
                            "bg-orange-100 [&>div]:bg-orange-500",
                          key === "enfoque" &&
                            "bg-purple-100 [&>div]:bg-purple-500",
                          key === "crecimiento" &&
                            "bg-urus-success/10 [&>div]:bg-urus-success",
                        )}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Alertas de riesgo operativo */}
        <Card className="md:col-span-3 border-l-4 border-l-urus-danger">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BrainCircuit className="h-5 w-5 text-urus-danger" />
              Alertas de riesgo operativo
            </CardTitle>
            <CardDescription>
              Patrones detectados automáticamente por el bot.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <AlertRow
              icon={<Zap className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />}
              label="Caída de energía prolongada"
              count={data.alertasActivas.energy_drop}
              description="≥3 sesiones con energía ≤ 2/5 en 14 días"
            />
            <AlertRow
              icon={
                <AlertTriangle className="h-5 w-5 text-urus-danger shrink-0 mt-0.5" />
              }
              label="Bloqueo emocional recurrente"
              count={data.alertasActivas.recurrent_block}
              description="≥3 sesiones de bloqueo en 14 días"
            />
            <AlertRow
              icon={
                <ThermometerSun className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
              }
              label="Sobrecarga operativa"
              count={data.alertasActivas.overload}
              description="≥5 sesiones con energía baja en 7 días"
            />

            {totalAlertas === 0 && (
              <p className="text-center py-4 text-sm text-muted-foreground">
                No se detectan riesgos activos actualmente.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component
// ---------------------------------------------------------------------------

function AlertRow({
  icon,
  label,
  count,
  description,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  description: string;
}) {
  return (
    <div className="p-3 bg-accent/50 rounded-lg border border-border/50">
      <div className="flex items-start gap-3">
        {icon}
        <div className="space-y-1 flex-1">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-sm text-foreground">{label}</p>
            <Badge
              variant={count > 0 ? "destructive" : "outline"}
              className="text-[10px]"
            >
              {count > 0 ? `${count} activa${count > 1 ? "s" : ""}` : "Sin riesgo"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}
