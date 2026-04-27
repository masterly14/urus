"use client";

import { Suspense, useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { RefInput } from "@/components/captacion/ref-input";
import { isValidRefFormat, normalizeRef } from "@/lib/routing/parse-ref-code";
import {
  Plus,
  Loader2,
  CalendarDays,
  Clock,
  Phone,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

interface NotaEncargoSesion {
  id: string;
  propertyCode: string | null;
  propertyRef: string;
  direccion: string;
  propietarioPhone: string;
  visitDateTime: string;
  state: string;
  tipoOperacion: string;
  precio: number;
  createdAt: string;
}

const STATE_LABELS: Record<string, string> = {
  PENDIENTE_PROPIEDAD: "Pendiente de propiedad",
  PENDING: "Pendiente",
  RECORDATORIO_ENVIADO: "Recordatorio enviado",
  CONFIRMADA: "Confirmada",
  NO_CONFIRMADA: "No confirmada",
  FORMULARIO_ENVIADO: "Formulario enviado",
  FORMULARIO_COMPLETADO: "Formulario completado",
  FIRMA_ENVIADA: "Firma enviada",
  FIRMADA: "Firmada",
  DOCUMENTO_ENVIADO: "Documento enviado",
  CANCELADA: "Cancelada",
};

const STATE_VARIANT: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  PENDIENTE_PROPIEDAD: "outline",
  PENDING: "outline",
  RECORDATORIO_ENVIADO: "secondary",
  CONFIRMADA: "default",
  NO_CONFIRMADA: "destructive",
  FORMULARIO_ENVIADO: "secondary",
  FORMULARIO_COMPLETADO: "secondary",
  FIRMA_ENVIADA: "secondary",
  FIRMADA: "default",
  DOCUMENTO_ENVIADO: "default",
  CANCELADA: "destructive",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtPrice(precio: number) {
  return new Intl.NumberFormat("es-ES").format(precio) + " \u20AC";
}

function todayLocalISO(): string {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 10);
}

function getTomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 10);
}

function minTimeForDate(fecha: string): string | undefined {
  const today = todayLocalISO();
  if (fecha !== today) return undefined;
  const d = new Date();
  d.setHours(d.getHours() + 1);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function isDateTimeInPast(fecha: string, hora: string): boolean {
  const dt = new Date(`${fecha}T${hora}:00`);
  return dt.getTime() <= Date.now();
}

// ---------------------------------------------------------------------------
// Mock fixtures for ?mock=1
// ---------------------------------------------------------------------------

const MOCK_SESIONES: NotaEncargoSesion[] = [
  {
    id: "mock-1",
    propertyCode: null,
    propertyRef: "URUS09VFEDE",
    direccion: "",
    propietarioPhone: "34666111222",
    visitDateTime: new Date(Date.now() + 86400000).toISOString(),
    state: "PENDIENTE_PROPIEDAD",
    tipoOperacion: "VENTA",
    precio: 0,
    createdAt: new Date().toISOString(),
  },
  {
    id: "mock-2",
    propertyCode: "mock-property-2",
    propertyRef: "URUS01DEMO",
    direccion: "Calle Ejemplo 1, Madrid",
    propietarioPhone: "34666111222",
    visitDateTime: new Date(Date.now() + 86400000).toISOString(),
    state: "PENDING",
    tipoOperacion: "VENTA",
    precio: 275000,
    createdAt: new Date().toISOString(),
  },
  {
    id: "mock-3",
    propertyCode: "mock-property-3",
    propertyRef: "URUS02DEMO",
    direccion: "Av. Libertad 42, Zaragoza",
    propietarioPhone: "34600333444",
    visitDateTime: new Date(Date.now() + 172800000).toISOString(),
    state: "RECORDATORIO_ENVIADO",
    tipoOperacion: "ALQUILER",
    precio: 850,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "mock-4",
    propertyCode: "mock-property-4",
    propertyRef: "URUS03DEMO",
    direccion: "Plaza Mayor 5, Valencia",
    propietarioPhone: "34611555666",
    visitDateTime: new Date(Date.now() - 86400000).toISOString(),
    state: "FIRMADA",
    tipoOperacion: "VENTA",
    precio: 180000,
    createdAt: new Date(Date.now() - 604800000).toISOString(),
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function CaptacionPageContent() {
  const searchParams = useSearchParams();
  const isMock = searchParams.get("mock") === "1";

  const [sesiones, setSesiones] = useState<NotaEncargoSesion[]>([]);
  const [loading, setLoading] = useState(!isMock);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState<string>("ALL");

  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetContentRef = useRef<HTMLDivElement>(null);
  const [propertyRef, setPropertyRef] = useState("");
  const [phone, setPhone] = useState("");
  const [fecha, setFecha] = useState(getTomorrow());
  const [hora, setHora] = useState("10:00");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchSesiones = useCallback(() => {
    if (isMock) {
      setSesiones(MOCK_SESIONES);
      setLoading(false);
      return;
    }
    setLoading(true);
    setFetchError(null);
    fetch("/api/captacion/sesiones")
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            body.error ?? `Error ${res.status} al cargar sesiones`,
          );
        }
        return res.json();
      })
      .then((data) => setSesiones(data.sesiones ?? []))
      .catch((err) => {
        setFetchError(
          err instanceof Error ? err.message : "Error de conexión",
        );
        setSesiones([]);
      })
      .finally(() => setLoading(false));
  }, [isMock]);

  useEffect(() => {
    fetchSesiones();
  }, [fetchSesiones]);

  function resetForm() {
    setPropertyRef("");
    setPhone("");
    setFecha(getTomorrow());
    setHora("10:00");
    setFormError(null);
  }

  function handleOpenSheet() {
    resetForm();
    setSheetOpen(true);
  }

  const dateTimeInPast = useMemo(
    () => fecha && hora && isDateTimeInPast(fecha, hora),
    [fecha, hora],
  );

  const canSubmit =
    isValidRefFormat(propertyRef) &&
    phone.replace(/\s/g, "").length >= 9 &&
    fecha &&
    hora &&
    !dateTimeInPast &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setFormError(null);

    const visitDateTime = new Date(`${fecha}T${hora}:00`).toISOString();

    try {
      const res = await fetch("/api/captacion/nota-encargo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyRef: normalizeRef(propertyRef),
          propietarioPhone: phone.replace(/\s/g, ""),
          visitDateTime,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error ?? "Error al crear la nota de encargo");
        return;
      }

      setSheetOpen(false);
      resetForm();
      fetchSesiones();
    } catch {
      setFormError("Error de conexión");
    } finally {
      setSubmitting(false);
    }
  }

  const filtered =
    stateFilter === "ALL"
      ? sesiones
      : sesiones.filter((s) => s.state === stateFilter);

  const stateOptions = [
    "ALL",
    ...Array.from(new Set(sesiones.map((s) => s.state))),
  ];

  const timeMin = minTimeForDate(fecha);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Captación</h1>
          <p className="text-muted-foreground">
            Sesiones de nota de encargo
          </p>
        </div>
        <Button onClick={handleOpenSheet}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva Nota de Encargo
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sesiones</CardTitle>
          <CardDescription>
            <span className="mr-4">Filtrar por estado:</span>
            <select
              className="rounded border px-2 py-1 text-sm"
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
            >
              {stateOptions.map((s) => (
                <option key={s} value={s}>
                  {s === "ALL" ? "Todos" : (STATE_LABELS[s] ?? s)}
                </option>
              ))}
            </select>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : fetchError ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              <p className="text-sm font-medium text-destructive">
                {fetchError}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchSesiones}
              >
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Reintentar
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <p className="text-muted-foreground">
                No hay sesiones de captación
              </p>
              <Button variant="outline" size="sm" onClick={handleOpenSheet}>
                <Plus className="mr-2 h-3.5 w-3.5" />
                Crear la primera
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Propiedad</TableHead>
                  <TableHead>Dirección</TableHead>
                  <TableHead>Visita</TableHead>
                  <TableHead>Precio</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Creada</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      <div className="flex flex-col gap-1">
                        <span>{s.propertyRef}</span>
                        <Badge
                          variant={s.propertyCode ? "secondary" : "outline"}
                          className="w-fit"
                        >
                          {s.propertyCode ? "Vinculada" : "Pendiente"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate">
                      {s.direccion || "\u2014"}
                    </TableCell>
                    <TableCell>{fmtDateTime(s.visitDateTime)}</TableCell>
                    <TableCell>{fmtPrice(s.precio)}</TableCell>
                    <TableCell>
                      <Badge variant={STATE_VARIANT[s.state] ?? "outline"}>
                        {STATE_LABELS[s.state] ?? s.state}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {fmtDate(s.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Sheet: Nueva Nota de Encargo ── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          ref={sheetContentRef}
          side="right"
          className="w-full overflow-y-auto data-[side=right]:border-l-0 sm:!max-w-[640px] md:!max-w-[720px] lg:!max-w-[820px]"
        >
          <SheetHeader>
            <SheetTitle>Nueva Nota de Encargo</SheetTitle>
            <SheetDescription>
              Agende una visita de captación y el sistema se encargará de enviar
              el recordatorio, el formulario y la firma al propietario por
              WhatsApp.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-6 px-4 pb-6">
            {/* Referencia futura de propiedad */}
            <div className="space-y-2">
              <Label htmlFor="sheet-property-ref">Código de referencia *</Label>
              <RefInput value={propertyRef} onChange={setPropertyRef} />
            </div>

            {/* Teléfono */}
            <div className="space-y-2">
              <Label htmlFor="sheet-phone">
                <Phone className="mr-1.5 inline-block h-3.5 w-3.5" />
                Teléfono del propietario *
              </Label>
              <Input
                id="sheet-phone"
                type="tel"
                placeholder="666777888"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>

            {/* Fecha y hora */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sheet-fecha">
                  <CalendarDays className="mr-1.5 inline-block h-3.5 w-3.5" />
                  Fecha *
                </Label>
                <Input
                  id="sheet-fecha"
                  type="date"
                  value={fecha}
                  min={todayLocalISO()}
                  onChange={(e) => setFecha(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sheet-hora">
                  <Clock className="mr-1.5 inline-block h-3.5 w-3.5" />
                  Hora *
                </Label>
                <Input
                  id="sheet-hora"
                  type="time"
                  value={hora}
                  min={timeMin}
                  onChange={(e) => setHora(e.target.value)}
                  required
                />
              </div>
            </div>

            {dateTimeInPast && (
              <p className="text-sm font-medium text-destructive">
                La fecha y hora de visita no pueden estar en el pasado
              </p>
            )}

            {formError && (
              <p className="text-sm font-medium text-destructive">
                {formError}
              </p>
            )}

            <Button
              type="submit"
              className="mt-auto w-full"
              size="lg"
              disabled={!canSubmit}
            >
              {submitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Agendar Nota de Encargo
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default function CaptacionPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Cargando captacion...</div>}>
      <CaptacionPageContent />
    </Suspense>
  );
}
