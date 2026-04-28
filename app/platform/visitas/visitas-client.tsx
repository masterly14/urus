"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarCheck,
  ExternalLink,
  Loader2,
  MapPin,
  Phone,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type VisitInterestProperty = {
  propertyId: string;
  source: "internal" | "external";
  title: string;
  reference: string;
  cadastralReference: string | null;
  address: string;
  city: string | null;
  zone: string | null;
  price: number | null;
  rooms: number | null;
  metersBuilt: number | null;
  portalUrl: string | null;
  contact: {
    kind: string;
    name: string | null;
    phones: string[];
  };
  missingContactPhone: boolean;
  interestedAt: string;
};

type VisitInterestPackage = {
  demand: {
    demandId: string;
    demandName: string;
    buyerPhone: string;
    comercialId: string | null;
    leadStatus: string;
  };
  selectionId: string | null;
  properties: VisitInterestProperty[];
};

type ApiResponse = {
  ok: boolean;
  packages: VisitInterestPackage[];
};

function tomorrow(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().split("T")[0];
}

function formatMoney(value: number | null): string {
  if (value === null) return "Precio no disponible";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function propertyMeta(property: VisitInterestProperty): string {
  return [
    property.rooms !== null ? `${property.rooms} hab.` : null,
    property.metersBuilt !== null ? `${property.metersBuilt} m2` : null,
    formatMoney(property.price),
  ].filter(Boolean).join(" · ");
}

export function VisitasClient() {
  const [packages, setPackages] = useState<VisitInterestPackage[]>([]);
  const [selectedDemandId, setSelectedDemandId] = useState<string>("");
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [fecha, setFecha] = useState(tomorrow());
  const [horaInicio, setHoraInicio] = useState("10:00");
  const [horaFin, setHoraFin] = useState("11:00");
  const [notas, setNotas] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedPackage = useMemo(
    () => packages.find((pkg) => pkg.demand.demandId === selectedDemandId) ?? null,
    [packages, selectedDemandId],
  );
  const selectedProperty = useMemo(
    () => selectedPackage?.properties.find((property) => property.propertyId === selectedPropertyId) ?? null,
    [selectedPackage, selectedPropertyId],
  );

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/visitas", { cache: "no-store" });
      const data = (await response.json()) as ApiResponse;
      if (!response.ok || !data.ok) throw new Error("No se pudieron cargar las visitas pendientes");
      setPackages(data.packages);
      if (!selectedDemandId && data.packages[0]) {
        setSelectedDemandId(data.packages[0].demand.demandId);
        setSelectedPropertyId(data.packages[0].properties[0]?.propertyId ?? "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando visitas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDemandChange = (demandId: string) => {
    const next = packages.find((pkg) => pkg.demand.demandId === demandId);
    setSelectedDemandId(demandId);
    setSelectedPropertyId(next?.properties[0]?.propertyId ?? "");
    setSuccess(null);
    setError(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedPackage || !selectedProperty) {
      setError("Selecciona una demanda y una propiedad.");
      return;
    }
    if (horaInicio >= horaFin) {
      setError("La hora de fin debe ser posterior a la hora de inicio.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/visitas/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          demandId: selectedPackage.demand.demandId,
          propertyId: selectedProperty.propertyId,
          fecha,
          horaInicio,
          horaFin,
          notas,
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        calendar?: { link?: string };
      };
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "No se pudo agendar la visita");
      }
      setSuccess(
        data.calendar?.link
          ? `Visita agendada. Calendario: ${data.calendar.link}`
          : "Visita agendada. El Flow de parte de visita quedó programado.",
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error agendando visita");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Visitas</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona las propiedades que interesan al comprador y registra la visita ya coordinada.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
          Actualizar
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-urus-danger/30 bg-urus-danger/10 p-3 text-sm text-urus-danger">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-lg border border-urus-success/30 bg-urus-success/10 p-3 text-sm text-urus-success">
          {success}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarCheck className="h-5 w-5" />
              Demandas con interés
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando...
              </div>
            ) : packages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay demandas con propiedades marcadas como interés.
              </p>
            ) : (
              packages.map((pkg) => (
                <div
                  key={pkg.demand.demandId}
                  className={cn(
                    "rounded-lg border p-4 transition-colors",
                    selectedDemandId === pkg.demand.demandId
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/40",
                  )}
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => handleDemandChange(pkg.demand.demandId)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-medium">
                        {pkg.demand.demandName || pkg.demand.demandId}
                      </h2>
                      <Badge variant="secondary">{pkg.demand.leadStatus}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Comprador: {pkg.demand.buyerPhone || "sin teléfono"} · {pkg.properties.length} propiedades
                    </p>
                  </button>

                  <div className="mt-4 grid gap-3">
                    {pkg.properties.map((property) => (
                      <button
                        type="button"
                        key={property.propertyId}
                        onClick={() => {
                          setSelectedDemandId(pkg.demand.demandId);
                          setSelectedPropertyId(property.propertyId);
                        }}
                        className={cn(
                          "rounded-md border p-3 text-left text-sm",
                          selectedPropertyId === property.propertyId
                            ? "border-primary bg-background"
                            : "bg-background/70 hover:bg-background",
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{property.title}</span>
                          <Badge variant={property.source === "internal" ? "default" : "secondary"}>
                            {property.source === "internal" ? "Cartera interna" : "Cartera externa"}
                          </Badge>
                          {property.missingContactPhone ? (
                            <Badge variant="destructive">Sin teléfono</Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 text-muted-foreground">{propertyMeta(property)}</p>
                        <p className="mt-1 flex items-center gap-1 text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5" />
                          {property.address}
                        </p>
                        <p className="mt-1 flex items-center gap-1">
                          <Phone className="h-3.5 w-3.5" />
                          {property.contact.phones.join(", ") || "Teléfono no disponible"}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Registrar visita</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedProperty ? (
              <form className="space-y-4" onSubmit={submit}>
                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                  <p className="font-medium">{selectedProperty.title}</p>
                  <p className="mt-1 text-muted-foreground">
                    Ref: {selectedProperty.reference} · Ref. catastral: {selectedProperty.cadastralReference ?? "no disponible"}
                  </p>
                  <p className="mt-1 text-muted-foreground">{selectedProperty.address}</p>
                  {selectedProperty.portalUrl ? (
                    <a
                      href={selectedProperty.portalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-primary underline"
                    >
                      Ver anuncio <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fecha">Día</Label>
                  <Input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="horaInicio">Inicio</Label>
                    <Input id="horaInicio" type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="horaFin">Fin</Label>
                    <Input id="horaFin" type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notas">Notas internas</Label>
                  <Textarea
                    id="notas"
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    placeholder="Ej: propietario confirma llaves, agencia externa abre portal..."
                    rows={4}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Agendar y activar Flow
                </Button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                Selecciona una propiedad interesada para registrar la visita.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
