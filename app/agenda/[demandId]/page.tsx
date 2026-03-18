"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface FormState {
  clienteNombre: string;
  propiedad: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  ubicacion: string;
  notas: string;
}

const INITIAL_STATE: FormState = {
  clienteNombre: "",
  propiedad: "",
  fecha: "",
  horaInicio: "",
  horaFin: "",
  ubicacion: "",
  notas: "",
};

function getTomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

export default function AgendaForm() {
  const router = useRouter();
  const params = useParams();
  const demandId = params.demandId as string;

  const [form, setForm] = useState<FormState>({
    ...INITIAL_STATE,
    fecha: getTomorrow(),
    horaInicio: "10:00",
    horaFin: "11:00",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    calendarLink?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = (field: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const validate = (): string | null => {
    if (!form.clienteNombre.trim()) return "El nombre del cliente es obligatorio.";
    if (!form.propiedad.trim()) return "La referencia de propiedad es obligatoria.";
    if (!form.fecha) return "Selecciona una fecha.";
    if (!form.horaInicio || !form.horaFin) return "Selecciona hora de inicio y fin.";
    if (form.horaInicio >= form.horaFin)
      return "La hora de fin debe ser posterior a la hora de inicio.";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/agenda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demandId, ...form }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Error al agendar la visita");
      }

      const data = await response.json();
      setResult({
        success: true,
        calendarLink: data.calendar?.link,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Ocurrió un error inesperado.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (result?.success) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-green-600">
              ¡Visita agendada con éxito!
            </CardTitle>
            <CardDescription>
              La visita ha sido registrada y añadida al calendario.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {result.calendarLink && (
              <a
                href={result.calendarLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-blue-600 underline hover:text-blue-800"
              >
                Ver en Google Calendar
              </a>
            )}
          </CardContent>
          <CardFooter>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push("/")}
            >
              Volver al inicio
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Agendar Visita</CardTitle>
          <CardDescription>
            Programa una visita para la demanda {demandId}. Se creará un evento
            en Google Calendar automáticamente.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="clienteNombre">Nombre del Cliente</Label>
              <Input
                id="clienteNombre"
                placeholder="Ej: Juan García"
                value={form.clienteNombre}
                onChange={update("clienteNombre")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="propiedad">Referencia de Propiedad</Label>
              <Input
                id="propiedad"
                placeholder="Ej: V-1234 Piso en Centro"
                value={form.propiedad}
                onChange={update("propiedad")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fecha">Fecha de la Visita</Label>
              <Input
                id="fecha"
                type="date"
                min={getTomorrow()}
                value={form.fecha}
                onChange={update("fecha")}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="horaInicio">Hora Inicio</Label>
                <Input
                  id="horaInicio"
                  type="time"
                  value={form.horaInicio}
                  onChange={update("horaInicio")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="horaFin">Hora Fin</Label>
                <Input
                  id="horaFin"
                  type="time"
                  value={form.horaFin}
                  onChange={update("horaFin")}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ubicacion">Ubicación (opcional)</Label>
              <Input
                id="ubicacion"
                placeholder="Ej: Calle Mayor 12, Madrid"
                value={form.ubicacion}
                onChange={update("ubicacion")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notas">Notas (opcional)</Label>
              <Textarea
                id="notas"
                placeholder="Instrucciones especiales, código portal, etc."
                value={form.notas}
                onChange={update("notas")}
                rows={3}
              />
            </div>

            {error && (
              <div className="text-sm text-red-500 font-medium">{error}</div>
            )}
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Agendando..." : "Agendar Visita"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
