"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface MarketListingRow {
  id: string;
  source: string;
  externalId: string;
  canonicalUrl: string;
  housingType: string;
  operation: string;
  status: string;
  price: number | null;
  pricePerMeter: number | null;
  builtArea: number | null;
  rooms: number | null;
  bathrooms: number | null;
  city: string;
  zone: string | null;
  mainImageUrl: string | null;
  qualityScore: number;
  qualityFlags: string[];
  lastSeenAt: string;
}

interface SearchResponse {
  ok: boolean;
  items: MarketListingRow[];
  cursor: string | null;
  meta: { total: number; freshAt: string };
  error?: string;
}

const HOUSING_TYPES = [
  "flat",
  "house",
  "duplex",
  "penthouse",
  "studio",
  "loft",
  "garage",
  "office",
  "premises",
  "countryhouse",
];

const SOURCE_LABEL: Record<string, string> = {
  source_a: "Fotocasa",
  source_b: "Pisos.com",
  source_c: "Milanuncios",
  source_d: "Idealista",
};

function formatPrice(value: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "ahora";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}min`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h`;
  return `${Math.round(diff / 86_400_000)}d`;
}

export function SearchView() {
  const [city, setCity] = useState("cordoba");
  const [housingType, setHousingType] = useState<string>("all");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [metersMin, setMetersMin] = useState("");
  const [metersMax, setMetersMax] = useState("");
  const [roomsMin, setRoomsMin] = useState("");
  const [zone, setZone] = useState("");

  const [items, setItems] = useState<MarketListingRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set("city", city);
    if (housingType && housingType !== "all") sp.set("housingType", housingType);
    if (priceMin) sp.set("priceMin", priceMin);
    if (priceMax) sp.set("priceMax", priceMax);
    if (metersMin) sp.set("metersMin", metersMin);
    if (metersMax) sp.set("metersMax", metersMax);
    if (roomsMin) sp.set("roomsMin", roomsMin);
    if (zone) sp.set("zone", zone);
    return sp.toString();
  }, [city, housingType, priceMin, priceMax, metersMin, metersMax, roomsMin, zone]);

  async function fetchPage(append: boolean, nextCursor: string | null) {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams(queryString);
      sp.set("limit", "50");
      if (nextCursor) sp.set("cursor", nextCursor);
      const response = await fetch(`/api/market/listings/search?${sp.toString()}`);
      const body = (await response.json().catch(() => ({}))) as SearchResponse;
      if (!response.ok || !body.ok) {
        setError(body.error ?? `HTTP ${response.status}`);
        return;
      }
      setTotal(body.meta.total);
      setCursor(body.cursor);
      setItems((prev) => (append ? [...prev, ...body.items] : body.items));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchPage(false, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFilters() {
    void fetchPage(false, null);
  }

  function loadMore() {
    if (cursor) void fetchPage(true, cursor);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Core de Mercado · Busqueda</h1>
        <p className="text-sm text-muted-foreground">
          Inventario canonico para QA. {total} listings totales con los filtros actuales.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="city">Ciudad</Label>
            <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="housingType">Tipologia</Label>
            <Select value={housingType} onValueChange={setHousingType}>
              <SelectTrigger id="housingType">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {HOUSING_TYPES.map((h) => (
                  <SelectItem key={h} value={h}>
                    {h}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="zone">Zona</Label>
            <Input id="zone" value={zone} onChange={(e) => setZone(e.target.value)} placeholder="opcional" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="roomsMin">Habs ≥</Label>
            <Input
              id="roomsMin"
              type="number"
              value={roomsMin}
              onChange={(e) => setRoomsMin(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="priceMin">Precio min (€)</Label>
            <Input
              id="priceMin"
              type="number"
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="priceMax">Precio max (€)</Label>
            <Input
              id="priceMax"
              type="number"
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="metersMin">m² min</Label>
            <Input
              id="metersMin"
              type="number"
              value={metersMin}
              onChange={(e) => setMetersMin(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="metersMax">m² max</Label>
            <Input
              id="metersMax"
              type="number"
              value={metersMax}
              onChange={(e) => setMetersMax(e.target.value)}
            />
          </div>
          <div className="col-span-full flex justify-end">
            <Button onClick={applyFilters} disabled={loading}>
              {loading ? "Buscando…" : "Aplicar filtros"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card>
          <CardContent className="text-sm text-destructive py-4">{error}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Resultados ({items.length} de {total})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead></TableHead>
                <TableHead>Portal</TableHead>
                <TableHead>Zona</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">m²</TableHead>
                <TableHead className="text-right">Hab/Baño</TableHead>
                <TableHead className="text-right">€/m²</TableHead>
                <TableHead className="text-right">Calidad</TableHead>
                <TableHead className="text-right">Visto</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    {row.mainImageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.mainImageUrl}
                        alt=""
                        className="h-10 w-14 rounded object-cover"
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {SOURCE_LABEL[row.source] ?? row.source}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.zone ? row.zone : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatPrice(row.price)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {row.builtArea ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {row.rooms ?? "—"}/{row.bathrooms ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {row.pricePerMeter
                      ? new Intl.NumberFormat("es-ES", {
                          maximumFractionDigits: 0,
                        }).format(row.pricePerMeter)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {row.qualityScore.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {relativeTime(row.lastSeenAt)}
                  </TableCell>
                  <TableCell>
                    <a
                      className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                      href={row.canonicalUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ver
                    </a>
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-sm text-muted-foreground">
                    Sin resultados.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {cursor && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" disabled={loading} onClick={loadMore}>
                {loading ? "Cargando…" : "Cargar mas"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
