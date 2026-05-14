"use client";

import { Suspense, useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { fromZonedTime } from "date-fns-tz";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CadastralRefInput } from "@/components/captacion/cadastral-ref-input";
import { normalizeCadastralRef } from "@/lib/nota-encargo/cadastral-ref";
import {
  Plus,
  Loader2,
  CalendarDays,
  Clock,
  Phone,
  AlertTriangle,
  RefreshCw,
  Trash2,
  User,
  XCircle,
} from "lucide-react";

const BUSINESS_TZ = "Europe/Madrid";

interface NotaEncargoSesion {
  id: string;
  propertyCode: string | null;
  propertyRef: string | null;
  refCatastral: string | null;
  direccion: string;
  propietarioPhone: string;
  visitDateTime: string;
  state: string;
  tipoOperacion: string;
  precio: number;
  createdAt: string;
  comercialId: string;
  comercialNombre: string | null;
}

interface ComercialOption {
  id: string;
  nombre: string;
  ciudad: string | null;
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
    timeZone: BUSINESS_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-ES", {
    timeZone: BUSINESS_TZ,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtPrice(precio: number) {
  return new Intl.NumberFormat("es-ES").format(precio) + " \u20AC";
}

/**
 * Devuelve la fecha YYYY-MM-DD en zona Europe/Madrid, independientemente de la
 * zona horaria del navegador del comercial. Previene que un comercial fuera de
 * España vea "hoy" desfasado un día.
 */
function todayMadridISO(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return `${map.year}-${map.month}-${map.day}`;
}

function tomorrowMadridISO(): string {
  const today = todayMadridISO();
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Hora mínima para hoy en Madrid (now + 1h con minuto truncado). Si la fecha
 * elegida no es hoy en Madrid, no se aplica mínimo. Evita desfases por la zona
 * local del navegador.
 */
function minTimeForDate(fecha: string): string | undefined {
  if (fecha !== todayMadridISO()) return undefined;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(Date.now() + 60 * 60 * 1000));
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  if (!map.hour || !map.minute) return undefined;
  return `${map.hour}:${map.minute}`;
}

/** Combina fecha+hora interpretándolas como hora civil de Europe/Madrid. */
function madridDateTime(fecha: string, hora: string): Date {
  return fromZonedTime(`${fecha}T${hora}:00`, BUSINESS_TZ);
}

function isDateTimeInPast(fecha: string, hora: string): boolean {
  if (!fecha || !hora) return false;
  return madridDateTime(fecha, hora).getTime() <= Date.now();
}

// ---------------------------------------------------------------------------
// Mock fixtures for ?mock=1
// ---------------------------------------------------------------------------

const MOCK_SESIONES: NotaEncargoSesion[] = [
  {
    id: "mock-1",
    propertyCode: null,
    propertyRef: null,
    refCatastral: "9872023VH5797S0006XS",
    direccion: "",
    propietarioPhone: "34666111222",
    visitDateTime: new Date(Date.now() + 86400000).toISOString(),
    state: "PENDIENTE_PROPIEDAD",
    tipoOperacion: "VENTA",
    precio: 0,
    createdAt: new Date().toISOString(),
    comercialId: "mock-com-1",
    comercialNombre: "Demo Comercial",
  },
  {
    id: "mock-2",
    propertyCode: "mock-property-2",
    propertyRef: "URUS01DEMO",
    refCatastral: "1234567AB1234C0001DE",
    direccion: "Calle Ejemplo 1, Madrid",
    propietarioPhone: "34666111222",
    visitDateTime: new Date(Date.now() + 86400000).toISOString(),
    state: "PENDING",
    tipoOperacion: "VENTA",
    precio: 275000,
    createdAt: new Date().toISOString(),
    comercialId: "mock-com-1",
    comercialNombre: "Demo Comercial",
  },
  {
    id: "mock-3",
    propertyCode: "mock-property-3",
    propertyRef: "URUS02DEMO",
    refCatastral: "2345678AB1234C0001DE",
    direccion: "Av. Libertad 42, Zaragoza",
    propietarioPhone: "34600333444",
    visitDateTime: new Date(Date.now() + 172800000).toISOString(),
    state: "RECORDATORIO_ENVIADO",
    tipoOperacion: "ALQUILER",
    precio: 850,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    comercialId: "mock-com-2",
    comercialNombre: "Otra Comercial",
  },
  {
    id: "mock-4",
    propertyCode: "mock-property-4",
    propertyRef: "URUS03DEMO",
    refCatastral: "3456789AB1234C0001DE",
    direccion: "Plaza Mayor 5, Valencia",
    propietarioPhone: "34611555666",
    visitDateTime: new Date(Date.now() - 86400000).toISOString(),
    state: "FIRMADA",
    tipoOperacion: "VENTA",
    precio: 180000,
    createdAt: new Date(Date.now() - 604800000).toISOString(),
    comercialId: "mock-com-1",
    comercialNombre: "Demo Comercial",
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
  const [canChooseComercial, setCanChooseComercial] = useState(false);
  const [assignableComerciales, setAssignableComerciales] = useState<
    ComercialOption[]
  >([]);
  const [currentComercialId, setCurrentComercialId] = useState<string | null>(
    null,
  );
  const [selectedComercialId, setSelectedComercialId] = useState("");

  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetContentRef = useRef<HTMLDivElement>(null);
  const [refCatastral, setRefCatastral] = useState("");
  const [phone, setPhone] = useState("");
  const [fecha, setFecha] = useState(tomorrowMadridISO());
  const [hora, setHora] = useState("10:00");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [pendingCancel, setPendingCancel] = useState<NotaEncargoSesion | null>(
    null,
  );
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<NotaEncargoSesion | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchSesiones = useCallback(() => {
    if (isMock) {
      setSesiones(MOCK_SESIONES);
      setCanChooseComercial(true);
      setAssignableComerciales([
        { id: "mock-com-1", nombre: "Demo Comercial", ciudad: "Córdoba" },
        { id: "mock-com-2", nombre: "Otra Comercial", ciudad: "Sevilla" },
      ]);
      setCurrentComercialId("mock-com-1");
      setSelectedComercialId("mock-com-1");
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
      .then((data) => {
        setSesiones(data.sesiones ?? []);
        const nextCanChoose = Boolean(data.canChooseComercial);
        setCanChooseComercial(nextCanChoose);
        setCurrentComercialId(data.currentComercialId ?? null);
        setAssignableComerciales(data.assignableComerciales ?? []);
        if (nextCanChoose) {
          setSelectedComercialId((prev) => {
            if (prev) return prev;
            return data.currentComercialId ?? data.assignableComerciales?.[0]?.id ?? "";
          });
        } else {
          setSelectedComercialId(data.currentComercialId ?? "");
        }
      })
      .catch((err) => {
        setFetchError(
          err instanceof Error ? err.message : "Error de conexión",
        );
        setSesiones([]);
        setCanChooseComercial(false);
        setAssignableComerciales([]);
        setCurrentComercialId(null);
        setSelectedComercialId("");
      })
      .finally(() => setLoading(false));
  }, [isMock]);

  useEffect(() => {
    fetchSesiones();
  }, [fetchSesiones]);

  useEffect(() => {
    if (!canChooseComercial) {
      setSelectedComercialId(currentComercialId ?? "");
      return;
    }
    if (!selectedComercialId) {
      setSelectedComercialId(
        currentComercialId ?? assignableComerciales[0]?.id ?? "",
      );
    }
  }, [
    canChooseComercial,
    currentComercialId,
    assignableComerciales,
    selectedComercialId,
  ]);

  function resetForm() {
    setRefCatastral("");
    setPhone("");
    setFecha(tomorrowMadridISO());
    setHora("10:00");
    setFormError(null);
    setSelectedComercialId((prev) => {
      if (canChooseComercial) {
        return prev || currentComercialId || assignableComerciales[0]?.id || "";
      }
      return currentComercialId ?? "";
    });
  }

  function handleOpenSheet() {
    resetForm();
    setSheetOpen(true);
  }

  async function handleCancel() {
    if (!pendingCancel) return;
    setCancelling(true);
    setCancelError(null);
    try {
      if (isMock) {
        setSesiones((prev) => prev.filter((s) => s.id !== pendingCancel.id));
        setPendingCancel(null);
        return;
      }
      const res = await fetch(
        `/api/captacion/nota-encargo/${pendingCancel.id}/cancel`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setCancelError(
          body.error ?? `Error ${res.status} al cancelar la nota`,
        );
        return;
      }
      setPendingCancel(null);
      fetchSesiones();
    } catch (err) {
      setCancelError(
        err instanceof Error ? err.message : "Error de conexión",
      );
    } finally {
      setCancelling(false);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      if (isMock) {
        setSesiones((prev) => prev.filter((s) => s.id !== pendingDelete.id));
        setPendingDelete(null);
        return;
      }
      const res = await fetch(
        `/api/captacion/nota-encargo/${pendingDelete.id}/delete`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setDeleteError(
          body.error ?? `Error ${res.status} al eliminar la nota`,
        );
        return;
      }
      setPendingDelete(null);
      fetchSesiones();
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Error de conexión",
      );
    } finally {
      setDeleting(false);
    }
  }

  const dateTimeInPast = useMemo(
    () => fecha && hora && isDateTimeInPast(fecha, hora),
    [fecha, hora],
  );

  const canSubmit =
    normalizeCadastralRef(refCatastral).length > 0 &&
    phone.replace(/\s/g, "").length >= 9 &&
    fecha &&
    hora &&
    (!canChooseComercial || selectedComercialId.length > 0) &&
    !dateTimeInPast &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setFormError(null);

    // Interpretamos `fecha`+`hora` como hora civil Europe/Madrid (la zona del
    // negocio) y enviamos al backend el equivalente UTC. Esto evita que un
    // comercial fuera de España agende a una hora distinta de la tecleada.
    const visitDateTime = madridDateTime(fecha, hora).toISOString();

    try {
      const res = await fetch("/api/captacion/nota-encargo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refCatastral: normalizeCadastralRef(refCatastral),
          propietarioPhone: phone.replace(/\s/g, ""),
          visitDateTime,
          ...(canChooseComercial ? { comercialId: selectedComercialId } : {}),
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
                  <TableHead>Comercial</TableHead>
                  <TableHead>Creada</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => {
                  const isTerminal =
                    s.state === "CANCELADA" ||
                    s.state === "FIRMADA" ||
                    s.state === "DOCUMENTO_ENVIADO";
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        <div className="flex flex-col gap-1">
                          <span>{s.refCatastral ?? "—"}</span>
                          {s.propertyRef && (
                            <span className="font-mono text-xs text-muted-foreground">
                              {s.propertyRef}
                            </span>
                          )}
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
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="gap-1 font-normal"
                          title={s.comercialId}
                        >
                          <User className="h-3 w-3" />
                          {s.comercialNombre ?? s.comercialId}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {fmtDate(s.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isTerminal}
                            onClick={() => {
                              setCancelError(null);
                              setPendingCancel(s);
                            }}
                            title={
                              isTerminal
                                ? "No se puede cancelar una nota en estado final"
                                : "Cancelar nota de encargo"
                            }
                          >
                            <XCircle className="h-4 w-4 text-destructive" />
                            <span className="sr-only">Cancelar</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={s.state !== "CANCELADA"}
                            onClick={() => {
                              setDeleteError(null);
                              setPendingDelete(s);
                            }}
                            title={
                              s.state === "CANCELADA"
                                ? "Eliminar definitivamente"
                                : "Primero cancela la nota para poder eliminarla"
                            }
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                            <span className="sr-only">Eliminar definitivamente</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
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
              <Label htmlFor="sheet-ref-catastral">Referencia catastral *</Label>
              <CadastralRefInput
                value={refCatastral}
                onChange={setRefCatastral}
              />
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

            {canChooseComercial && (
              <div className="space-y-2">
                <Label htmlFor="sheet-comercial">Comercial responsable *</Label>
                <select
                  id="sheet-comercial"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={selectedComercialId}
                  onChange={(e) => setSelectedComercialId(e.target.value)}
                  required
                >
                  <option value="">Selecciona un comercial</option>
                  {assignableComerciales.map((comercial) => (
                    <option key={comercial.id} value={comercial.id}>
                      {comercial.nombre}
                      {comercial.ciudad ? ` · ${comercial.ciudad}` : ""}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Como CEO/Admin, debes indicar qué comercial gestionará esta nota.
                </p>
              </div>
            )}

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
                  min={todayMadridISO()}
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

      {/* ── Confirmación de cancelación ── */}
      <AlertDialog
        open={pendingCancel !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingCancel(null);
            setCancelError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar nota de encargo</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Esta acción marcará la nota como <strong>cancelada</strong> y
                  detendrá cualquier recordatorio o envío pendiente al
                  propietario. La nota se conservará en el historial.
                </p>
                {pendingCancel && (
                  <div className="rounded border bg-muted/30 p-3 text-xs">
                    <div>
                      <span className="font-medium">Referencia: </span>
                      {pendingCancel.refCatastral ?? "—"}
                    </div>
                    <div>
                      <span className="font-medium">Visita: </span>
                      {fmtDateTime(pendingCancel.visitDateTime)}
                    </div>
                    <div>
                      <span className="font-medium">Propietario: </span>
                      {pendingCancel.propietarioPhone}
                    </div>
                    <div>
                      <span className="font-medium">Estado actual: </span>
                      {STATE_LABELS[pendingCancel.state] ?? pendingCancel.state}
                    </div>
                  </div>
                )}
                {cancelError && (
                  <p className="font-medium text-destructive">{cancelError}</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleCancel();
              }}
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cancelar nota
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Confirmación de eliminación definitiva ── */}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar nota de encargo</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Esta acción elimina la nota <strong>de forma definitiva</strong>{" "}
                  y la quita de la vista. No se puede deshacer.
                </p>
                {pendingDelete && (
                  <div className="rounded border bg-muted/30 p-3 text-xs">
                    <div>
                      <span className="font-medium">Referencia: </span>
                      {pendingDelete.refCatastral ?? "—"}
                    </div>
                    <div>
                      <span className="font-medium">Visita: </span>
                      {fmtDateTime(pendingDelete.visitDateTime)}
                    </div>
                    <div>
                      <span className="font-medium">Estado: </span>
                      {STATE_LABELS[pendingDelete.state] ?? pendingDelete.state}
                    </div>
                  </div>
                )}
                {deleteError && (
                  <p className="font-medium text-destructive">{deleteError}</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
