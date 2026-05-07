/**
 * /platform/market/health
 *
 * Panel interno del Core de Mercado. Muestra frescura, cobertura, estado
 * de circuit breakers por portal y los ultimos eventos. Para QA durante
 * el cierre del MVP.
 *
 * Solo accesible para admin/CEO. Si el usuario no esta autenticado o no
 * tiene rol, redirigimos al login con redirectTo.
 */

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { collectHealthSnapshot } from "@/lib/market/scheduler";
import { listRecentMarketEvents } from "@/lib/market/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TriggerSeedButton } from "./trigger-seed-button";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function freshnessVariant(seconds: number | null): "default" | "secondary" | "destructive" {
  if (seconds == null) return "secondary";
  if (seconds <= 7_200) return "default"; // <= 2h: verde
  if (seconds <= 14_400) return "secondary"; // <= 4h: ambar
  return "destructive";
}

function freshnessLabel(seconds: number | null): string {
  if (seconds == null) return "sin datos";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3_600) return `${Math.round(seconds / 60)}min`;
  if (seconds < 86_400) return `${(seconds / 3_600).toFixed(1)}h`;
  return `${Math.round(seconds / 86_400)}d`;
}

function breakerVariant(status: string): "default" | "secondary" | "destructive" {
  if (status === "OPEN") return "destructive";
  if (status === "HALF_OPEN") return "secondary";
  return "default";
}

function workerVariant(
  status: "ok" | "degraded" | "unreachable" | "unconfigured",
): "default" | "secondary" | "destructive" {
  if (status === "ok") return "default";
  if (status === "degraded") return "secondary";
  return "destructive";
}

export default async function MarketHealthPage() {
  const session = await getSession();
  if (!session) redirect("/login?redirectTo=/platform/market/health");
  if (session.role !== "admin" && session.role !== "ceo") {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Sin permisos</h1>
        <p className="text-sm text-muted-foreground">
          Esta vista esta restringida a roles admin/CEO.
        </p>
      </div>
    );
  }

  const [snapshot, recentEvents, seeds] = await Promise.all([
    collectHealthSnapshot(),
    listRecentMarketEvents(15),
    prisma.marketSeed.findMany({
      where: { active: true },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    }),
  ]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Core de Mercado · Health</h1>
        <p className="text-sm text-muted-foreground">
          Estado consolidado del pipeline. Generado{" "}
          {new Date(snapshot.generatedAt).toLocaleString("es-ES")}.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Worker (Railway)</CardTitle>
          <Badge variant={workerVariant(snapshot.workerStatus)}>
            {snapshot.workerStatus.toUpperCase()}
          </Badge>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {snapshot.workerStatus === "unconfigured" &&
            "MARKET_WORKER_BASE_URL / SHARED_SECRET no configurados en Vercel."}
          {snapshot.workerStatus === "unreachable" &&
            "Worker configurado pero no responde al endpoint de health."}
          {snapshot.workerStatus === "degraded" &&
            "Worker en modo degradado (concurrencia saturada)."}
          {snapshot.workerStatus === "ok" && "Worker OK."}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {snapshot.perPortal.map((portal) => (
          <Card key={portal.source}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">
                {portal.source === "source_a"
                  ? "Fotocasa"
                  : portal.source === "source_b"
                    ? "Pisos.com"
                    : portal.source === "source_d"
                      ? "Idealista"
                      : portal.source}
              </CardTitle>
              <Badge variant={breakerVariant(portal.breakerStatus)}>
                {portal.breakerStatus}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Listings activos</span>
                <span className="font-mono">{portal.activeListings}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Frescura snapshot</span>
                <Badge variant={freshnessVariant(portal.freshnessSeconds)}>
                  {freshnessLabel(portal.freshnessSeconds)}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ultimo crawl</span>
                <span className="font-mono text-xs">
                  {portal.lastCrawlAt
                    ? new Date(portal.lastCrawlAt).toLocaleString("es-ES")
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Estado del run</span>
                <span className="font-mono text-xs">
                  {portal.lastCrawlStatus ?? "—"}
                </span>
              </div>
              {portal.failureCount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fallos consecutivos</span>
                  <span className="font-mono text-destructive">
                    {portal.failureCount}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {snapshot.idealista && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              Idealista · Bright Data (Fase 2.c)
            </CardTitle>
            <div className="flex gap-2">
              {snapshot.idealista.costAlert && (
                <Badge variant="destructive">COSTE</Badge>
              )}
              {snapshot.idealista.fallbackAlert && (
                <Badge variant="destructive">FALLBACK</Badge>
              )}
              {!snapshot.idealista.costAlert && !snapshot.idealista.fallbackAlert && (
                <Badge>OK</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Requests mes-actual</span>
              <span className="font-mono">
                {snapshot.idealista.monthRequests.toLocaleString("es-ES")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Coste estimado</span>
              <span
                className={`font-mono ${snapshot.idealista.costAlert ? "text-destructive" : ""}`}
              >
                ${snapshot.idealista.monthCostUsd.toFixed(2)} / ${snapshot.idealista.costAlertThreshold}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fallback rate 24h</span>
              <span
                className={`font-mono ${snapshot.idealista.fallbackAlert ? "text-destructive" : ""}`}
              >
                {(snapshot.idealista.fallbackRate24h * 100).toFixed(1)}% (
                {snapshot.idealista.totalRuns24h} runs)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Success rate Bright Data</span>
              <span className="font-mono">
                {snapshot.idealista.brightDataSuccessRate != null
                  ? `${(snapshot.idealista.brightDataSuccessRate * 100).toFixed(2)}%`
                  : "sin datos"}
                {snapshot.idealista.brightDataSuccessRateAt && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    (
                    {new Date(snapshot.idealista.brightDataSuccessRateAt).toLocaleDateString(
                      "es-ES",
                    )}
                    )
                  </span>
                )}
              </span>
            </div>
            <div className="col-span-full text-xs text-muted-foreground">
              Coste por request premium domain:{" "}
              <code>BRIGHTDATA_WEB_UNLOCKER_PREMIUM_PRICE_USD</code> (default $0.005). Umbrales
              ajustables con <code>MARKET_IDEALISTA_COST_ALERT_USD</code> y{" "}
              <code>MARKET_IDEALISTA_FALLBACK_ALERT_RATIO</code>. Ver
              docs/core-sistema-mercado-decisiones.md §11.5.
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Seeds activos ({seeds.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {seeds.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No hay seeds activos. Ejecuta{" "}
              <code className="rounded bg-muted px-1">
                npx tsx scripts/seed-market-cordoba.ts
              </code>
              .
            </p>
          )}
          {seeds.map((seed) => (
            <div
              key={seed.id}
              className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {seed.source === "source_a"
                      ? "Fotocasa"
                      : seed.source === "source_b"
                        ? "Pisos.com"
                        : seed.source === "source_d"
                          ? "Idealista"
                          : seed.source}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {seed.city}
                    {seed.zone ? ` · ${seed.zone}` : ""}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    cadencia {seed.cadenceMinutes}min
                  </span>
                </div>
                <a
                  className="block text-xs font-mono text-muted-foreground underline-offset-2 hover:underline"
                  href={seed.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {seed.url}
                </a>
                <span className="text-xs text-muted-foreground">
                  Ultimo run:{" "}
                  {seed.lastRunAt
                    ? new Date(seed.lastRunAt).toLocaleString("es-ES")
                    : "nunca"}
                </span>
              </div>
              <TriggerSeedButton seedId={seed.id} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ultimos eventos ({recentEvents.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {recentEvents.length === 0 && (
            <p className="text-muted-foreground">Sin eventos registrados todavia.</p>
          )}
          {recentEvents.map((event) => (
            <div
              key={event.id}
              className="flex items-center justify-between border-b pb-1 last:border-b-0"
            >
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs">
                  {event.type}
                </Badge>
                {event.source && (
                  <span className="text-xs text-muted-foreground">
                    {event.source}
                  </span>
                )}
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                {new Date(event.occurredAt).toLocaleString("es-ES")}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
