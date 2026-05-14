"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface DashboardKPIs {
  totalActive: number;
  newLast7d: number;
  removedLast7d: number;
  priceDropsLast7d: number;
}

interface ZoneAggregate {
  zone: string;
  totalActive: number;
  priceMedian: number | null;
  ppmMedian: number | null;
  ppmDeltaPct30d: number | null;
}

interface HousingAggregate {
  housingType: string;
  totalActive: number;
  priceMedian: number | null;
  ppmMedian: number | null;
}

interface PpmDailyPoint {
  day: string;
  ppmMedian: number | null;
  totalActive: number;
}

interface TopAdvertiserEntry {
  advertiserId: string;
  displayName: string | null;
  advertiserType: string | null;
  phoneCanonical: string | null;
  inmovillaContactId: string | null;
  activeListings: number;
}

interface DashboardData {
  city: string;
  generatedAt: string;
  kpis: DashboardKPIs;
  zones: ZoneAggregate[];
  housingTypes: HousingAggregate[];
  ppmDaily: PpmDailyPoint[];
  topAdvertisers: TopAdvertiserEntry[];
}

function formatPrice(value: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPpm(value: number | null): string {
  if (value == null) return "—";
  return `${new Intl.NumberFormat("es-ES").format(Math.round(value))} €/m²`;
}

function formatPct(value: number | null): string {
  if (value == null) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(1)}%`;
}

export function DashboardClient({
  data,
  initialCity,
  initialDays,
}: {
  data: DashboardData;
  initialCity: string;
  initialDays: number;
}) {
  const router = useRouter();
  const [city, setCity] = useState(initialCity);
  const [days, setDays] = useState(initialDays);

  function applyFilters() {
    const sp = new URLSearchParams();
    sp.set("city", city);
    sp.set("days", String(days));
    router.push(`/platform/market/dashboard?${sp.toString()}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Inteligencia de mercado</h1>
        <p className="text-sm text-muted-foreground">
          {data.city} · generado{" "}
          {new Date(data.generatedAt).toLocaleString("es-ES")}
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="city">Ciudad</Label>
            <Input
              id="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="cordoba"
              className="w-48"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="days">Ventana (dias)</Label>
            <Input
              id="days"
              type="number"
              min={7}
              max={90}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-32"
            />
          </div>
          <Button onClick={applyFilters}>Aplicar</Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Activos" value={data.kpis.totalActive.toLocaleString("es-ES")} />
        <KpiCard
          label="Nuevos (7d)"
          value={data.kpis.newLast7d.toLocaleString("es-ES")}
        />
        <KpiCard
          label="Retirados (7d)"
          value={data.kpis.removedLast7d.toLocaleString("es-ES")}
        />
        <KpiCard
          label="Rebajas relevantes (7d)"
          value={data.kpis.priceDropsLast7d.toLocaleString("es-ES")}
          hint="caida ≥ 3%"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Evolucion eur/m² mediano ({data.ppmDaily.length} puntos)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.ppmDaily.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aun no hay snapshots historicos suficientes (el cron
              `refresh-snapshot` los persiste cada 30 min).
            </p>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={data.ppmDaily.map((p) => ({
                    day: p.day,
                    ppm: p.ppmMedian,
                  }))}
                >
                  <XAxis
                    dataKey="day"
                    tickFormatter={(d: string) => d.slice(5)}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value) => [
                      formatPpm(typeof value === "number" ? value : Number(value) || 0),
                      "€/m²",
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="ppm"
                    stroke="currentColor"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Por zona ({data.zones.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zona</TableHead>
                  <TableHead className="text-right">N</TableHead>
                  <TableHead className="text-right">Precio mediano</TableHead>
                  <TableHead className="text-right">€/m²</TableHead>
                  <TableHead className="text-right">Δ 30d</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.zones.map((zone) => (
                  <TableRow key={zone.zone}>
                    <TableCell className="text-sm">{zone.zone}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {zone.totalActive.toLocaleString("es-ES")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPrice(zone.priceMedian)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPpm(zone.ppmMedian)}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${
                        zone.ppmDeltaPct30d != null && zone.ppmDeltaPct30d > 0
                          ? "text-emerald-600"
                          : zone.ppmDeltaPct30d != null && zone.ppmDeltaPct30d < 0
                            ? "text-destructive"
                            : "text-muted-foreground"
                      }`}
                    >
                      {formatPct(zone.ppmDeltaPct30d)}
                    </TableCell>
                  </TableRow>
                ))}
                {data.zones.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-sm text-muted-foreground"
                    >
                      Sin datos.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Por tipologia ({data.housingTypes.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipologia</TableHead>
                  <TableHead className="text-right">N</TableHead>
                  <TableHead className="text-right">Precio mediano</TableHead>
                  <TableHead className="text-right">€/m²</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.housingTypes.map((row) => (
                  <TableRow key={row.housingType}>
                    <TableCell className="text-sm">{row.housingType}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.totalActive.toLocaleString("es-ES")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPrice(row.priceMedian)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPpm(row.ppmMedian)}
                    </TableCell>
                  </TableRow>
                ))}
                {data.housingTypes.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center text-sm text-muted-foreground"
                    >
                      Sin datos.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Top advertisers ({data.topAdvertisers.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Publicante</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Telefono</TableHead>
                <TableHead className="text-right">Activos</TableHead>
                <TableHead>CRM</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.topAdvertisers.map((adv) => (
                <TableRow key={adv.advertiserId}>
                  <TableCell className="text-sm">
                    {adv.displayName ?? "—"}
                  </TableCell>
                  <TableCell>
                    {adv.advertiserType ? (
                      <Badge variant="outline" className="text-[10px]">
                        {adv.advertiserType}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {adv.phoneCanonical ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {adv.activeListings.toLocaleString("es-ES")}
                  </TableCell>
                  <TableCell>
                    {adv.inmovillaContactId ? (
                      <Badge variant="secondary" className="text-[10px]">
                        En CRM
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        sin CRM
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {data.topAdvertisers.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-sm text-muted-foreground"
                  >
                    Sin datos.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="text-3xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
