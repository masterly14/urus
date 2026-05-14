"use client";

import { useCallback, useState } from "react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

type AlertChannel = "in_app" | "whatsapp";
type AlertFrequency = "realtime" | "hourly" | "daily";

interface Filters {
  city?: string;
  sources?: string[];
  operation?: "sale" | "rent";
  advertiserType?: "particular" | "agency";
  hasPhone?: boolean;
  priceMin?: number;
  priceMax?: number;
  areaMin?: number;
  areaMax?: number;
  roomsMin?: number;
}

interface Alert {
  id: string;
  userId: string;
  name: string;
  filters: Filters;
  channels: AlertChannel[];
  frequency: AlertFrequency;
  active: boolean;
  lastEvaluatedAt: string | null;
  lastDeliveredAt: string | null;
  deliveryCount: number;
  createdAt: string;
  updatedAt: string;
}

const FREQ_LABEL: Record<AlertFrequency, string> = {
  realtime: "Tiempo real (5 min)",
  hourly: "Cada hora",
  daily: "Diaria",
};

const CHANNEL_LABEL: Record<AlertChannel, string> = {
  in_app: "App",
  whatsapp: "WhatsApp",
};

const SOURCE_LABEL: Record<string, string> = {
  source_a: "Fotocasa",
  source_b: "Pisos.com",
  source_c: "Milanuncios",
  source_d: "Idealista",
};

interface FormState {
  name: string;
  city: string;
  priceMin: string;
  priceMax: string;
  areaMin: string;
  roomsMin: string;
  advertiserType: "" | "particular" | "agency";
  hasPhone: boolean;
  sources: string[];
  operation: "sale" | "rent";
  channels: AlertChannel[];
  frequency: AlertFrequency;
}

const EMPTY_FORM: FormState = {
  name: "",
  city: "cordoba",
  priceMin: "",
  priceMax: "",
  areaMin: "",
  roomsMin: "",
  advertiserType: "",
  hasPhone: false,
  sources: [],
  operation: "sale",
  channels: ["in_app"],
  frequency: "hourly",
};

function describeFilters(f: Filters): string {
  const parts: string[] = [];
  if (f.city) parts.push(f.city);
  if (f.operation) parts.push(f.operation);
  if (f.priceMin != null || f.priceMax != null) {
    parts.push(`${f.priceMin ?? "?"}–${f.priceMax ?? "?"}€`);
  }
  if (f.areaMin != null) parts.push(`≥${f.areaMin}m²`);
  if (f.roomsMin != null) parts.push(`≥${f.roomsMin}hab`);
  if (f.advertiserType) parts.push(f.advertiserType);
  if (f.hasPhone) parts.push("c/ tel");
  if (f.sources && f.sources.length > 0) {
    parts.push(f.sources.map((s) => SOURCE_LABEL[s] ?? s).join("+"));
  }
  return parts.join(" · ") || "(sin filtros)";
}

export function AlertsClient({ initial }: { initial: Alert[] }) {
  const [alerts, setAlerts] = useState<Alert[]>(initial);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    const response = await fetch("/api/market/alerts");
    const body = (await response.json()) as
      | { ok: true; items: Alert[] }
      | { ok: false };
    if (response.ok && "ok" in body && body.ok) setAlerts(body.items);
  }, []);

  function buildFiltersFromForm(f: FormState): Filters {
    return {
      city: f.city.trim() || undefined,
      operation: f.operation,
      priceMin: f.priceMin ? Number(f.priceMin) : undefined,
      priceMax: f.priceMax ? Number(f.priceMax) : undefined,
      areaMin: f.areaMin ? Number(f.areaMin) : undefined,
      roomsMin: f.roomsMin ? Number(f.roomsMin) : undefined,
      advertiserType: f.advertiserType || undefined,
      hasPhone: f.hasPhone || undefined,
      sources: f.sources.length > 0 ? f.sources : undefined,
    };
  }

  async function submitCreate() {
    if (!form.name.trim()) {
      setError("El nombre es obligatorio");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/market/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          filters: buildFiltersFromForm(form),
          channels: form.channels,
          frequency: form.frequency,
        }),
      });
      const body = (await response.json()) as
        | { ok: true; alert: Alert }
        | { ok: false; error?: { message?: string } };
      if (!response.ok || !("ok" in body) || !body.ok) {
        const msg =
          "error" in body && body.error?.message
            ? body.error.message
            : `HTTP ${response.status}`;
        setError(msg);
        return;
      }
      setAlerts((prev) => [body.alert, ...prev]);
      setCreating(false);
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function toggle(alert: Alert) {
    const response = await fetch(`/api/market/alerts/${alert.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !alert.active }),
    });
    if (!response.ok) return;
    await reload();
  }

  async function remove(alert: Alert) {
    if (!confirm(`Eliminar alerta "${alert.name}"?`)) return;
    const response = await fetch(`/api/market/alerts/${alert.id}`, {
      method: "DELETE",
    });
    if (!response.ok) return;
    setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
  }

  async function probe(alert: Alert) {
    const response = await fetch(
      `/api/market/alerts/${alert.id}/test`,
      { method: "POST" },
    );
    const body = (await response.json()) as
      | { ok: true; matches: number; sample: { listingId: string; price: number | null }[] }
      | { ok: false };
    if (!response.ok || !("ok" in body) || !body.ok) {
      setTestResults((p) => ({ ...p, [alert.id]: "Error al probar" }));
      return;
    }
    setTestResults((p) => ({
      ...p,
      [alert.id]: `${body.matches} matches en los últimos 7 días`,
    }));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Alertas guardadas</h1>
          <p className="text-sm text-muted-foreground">
            Recibe avisos en la app y por WhatsApp cuando aparezcan
            oportunidades nuevas que cumplan tus filtros.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>Nueva alerta</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mis alertas ({alerts.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {alerts.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No tienes alertas. Crea una nueva para empezar.
            </p>
          )}
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="flex flex-col gap-2 rounded border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{alert.name}</span>
                  {!alert.active && (
                    <Badge variant="outline" className="text-[10px]">
                      pausada
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-[10px]">
                    {FREQ_LABEL[alert.frequency]}
                  </Badge>
                  {alert.channels.map((c) => (
                    <Badge key={c} variant="outline" className="text-[10px]">
                      {CHANNEL_LABEL[c]}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {describeFilters(alert.filters)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Entregados: {alert.deliveryCount} ·{" "}
                  {alert.lastDeliveredAt
                    ? `Último: ${new Date(alert.lastDeliveredAt).toLocaleString("es-ES")}`
                    : "Sin entregas todavía"}
                  {testResults[alert.id] && ` · ${testResults[alert.id]}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => void probe(alert)}>
                  Probar
                </Button>
                <div className="flex items-center gap-1">
                  <Switch
                    checked={alert.active}
                    onCheckedChange={() => void toggle(alert)}
                  />
                  <span className="text-xs">{alert.active ? "Activa" : "Pausada"}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void remove(alert)}
                >
                  Eliminar
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nueva alerta</DialogTitle>
            <DialogDescription>
              Solo se entregan listings nuevos o cambios desde la última
              evaluación. Los duplicados se filtran por dedupeKey.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label>Nombre</Label>
              <Input
                value={form.name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, name: e.target.value }))
                }
                placeholder="Pisos &lt; 200k en Centro"
              />
            </div>
            <div className="space-y-1">
              <Label>Ciudad</Label>
              <Input
                value={form.city}
                onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Operación</Label>
              <select
                value={form.operation}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    operation: e.target.value as "sale" | "rent",
                  }))
                }
                className="h-9 w-full rounded-md border border-neutral-300/60 bg-background/70 px-2 text-sm dark:border-neutral-700/70"
              >
                <option value="sale">Venta</option>
                <option value="rent">Alquiler</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Precio mínimo (€)</Label>
              <Input
                type="number"
                value={form.priceMin}
                onChange={(e) =>
                  setForm((p) => ({ ...p, priceMin: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Precio máximo (€)</Label>
              <Input
                type="number"
                value={form.priceMax}
                onChange={(e) =>
                  setForm((p) => ({ ...p, priceMax: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Superficie mínima (m²)</Label>
              <Input
                type="number"
                value={form.areaMin}
                onChange={(e) =>
                  setForm((p) => ({ ...p, areaMin: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Habitaciones mínimas</Label>
              <Input
                type="number"
                value={form.roomsMin}
                onChange={(e) =>
                  setForm((p) => ({ ...p, roomsMin: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Tipo de publicante</Label>
              <select
                value={form.advertiserType}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    advertiserType: e.target.value as "" | "particular" | "agency",
                  }))
                }
                className="h-9 w-full rounded-md border border-neutral-300/60 bg-background/70 px-2 text-sm dark:border-neutral-700/70"
              >
                <option value="">Cualquiera</option>
                <option value="particular">Particular</option>
                <option value="agency">Agencia</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <Switch
                checked={form.hasPhone}
                onCheckedChange={(v) =>
                  setForm((p) => ({ ...p, hasPhone: !!v }))
                }
              />
              <Label className="text-xs">Solo con teléfono</Label>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Portales</Label>
              <div className="flex flex-wrap gap-2">
                {(["source_d", "source_a", "source_b", "source_c"] as const).map(
                  (s) => {
                    const active = form.sources.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() =>
                          setForm((p) => ({
                            ...p,
                            sources: active
                              ? p.sources.filter((x) => x !== s)
                              : [...p.sources, s],
                          }))
                        }
                        className={`rounded border px-2 py-1 text-xs ${
                          active
                            ? "border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
                            : "border-neutral-300 bg-background"
                        }`}
                      >
                        {SOURCE_LABEL[s]}
                      </button>
                    );
                  },
                )}
                <span className="self-center text-[10px] text-muted-foreground">
                  (vacío = todos)
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Frecuencia</Label>
              <select
                value={form.frequency}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    frequency: e.target.value as AlertFrequency,
                  }))
                }
                className="h-9 w-full rounded-md border border-neutral-300/60 bg-background/70 px-2 text-sm dark:border-neutral-700/70"
              >
                <option value="realtime">Tiempo real (5 min)</option>
                <option value="hourly">Cada hora</option>
                <option value="daily">Diaria</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Canales</Label>
              <div className="flex gap-2">
                {(["in_app", "whatsapp"] as const).map((c) => {
                  const active = form.channels.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() =>
                        setForm((p) => ({
                          ...p,
                          channels: active
                            ? p.channels.filter((x) => x !== c)
                            : ([...p.channels, c] as AlertChannel[]),
                        }))
                      }
                      className={`rounded border px-2 py-1 text-xs ${
                        active
                          ? "border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
                          : "border-neutral-300 bg-background"
                      }`}
                    >
                      {CHANNEL_LABEL[c]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {error && (
            <p className="rounded bg-destructive/10 p-2 text-xs text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              disabled={submitting}
              onClick={() => setCreating(false)}
            >
              Cancelar
            </Button>
            <Button
              disabled={submitting || form.channels.length === 0}
              onClick={() => void submitCreate()}
            >
              {submitting ? "Creando…" : "Crear alerta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
