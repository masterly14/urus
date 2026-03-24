"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DemoUiBanner } from "@/components/demo-ui-banner";

type PostVisitaFormProps = {
  demandId: string;
  demoMode?: boolean;
};

export function PostVisitaForm({ demandId, demoMode = false }: PostVisitaFormProps) {
  const router = useRouter();

  const [interes, setInteres] = useState<string>("");
  const [notas, setNotas] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [success, setSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!interes) {
      setError("Por favor, selecciona el nivel de interés.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    if (demoMode) {
      setSuccess(true);
      setIsSubmitting(false);
      setTimeout(() => {
        router.push("/");
      }, 3000);
      return;
    }

    try {
      const response = await fetch("/api/post-visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demandId, interes, notas }),
      });

      if (!response.ok) {
        throw new Error("Error al enviar el formulario");
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/");
      }, 3000);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Ocurrió un error inesperado.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="flex min-h-screen flex-col bg-gray-50">
        {demoMode ? <DemoUiBanner demoPath="/post-visita/demo" /> : null}
        <div className="flex flex-1 items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-green-600">¡Registrado con éxito!</CardTitle>
              <CardDescription>
                {demoMode
                  ? "Vista demo: no se ha guardado ningún dato."
                  : "La evaluación de la visita ha sido guardada."}
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {demoMode ? <DemoUiBanner demoPath="/post-visita/demo" /> : null}
      <div className="flex flex-1 items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Evaluación Post-Visita</CardTitle>
            <CardDescription>
              Registra el interés del cliente tras la visita para la demanda {demandId}.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label>Nivel de Interés</Label>
                <RadioGroup
                  value={interes}
                  onValueChange={setInteres}
                  className="flex flex-col space-y-1"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="alto" id="alto" />
                    <Label htmlFor="alto" className="cursor-pointer">
                      Alto - Muy interesado
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="medio" id="medio" />
                    <Label htmlFor="medio" className="cursor-pointer">
                      Medio - Lo considerará
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="bajo" id="bajo" />
                    <Label htmlFor="bajo" className="cursor-pointer">
                      Bajo - No encaja
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-3">
                <Label htmlFor="notas">Notas u Observaciones</Label>
                <Textarea
                  id="notas"
                  placeholder="Escribe aquí los comentarios del cliente, objeciones, etc."
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  rows={4}
                />
              </div>

              {error && (
                <div className="text-sm font-medium text-red-500">{error}</div>
              )}
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Guardando..." : "Guardar Evaluación"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
