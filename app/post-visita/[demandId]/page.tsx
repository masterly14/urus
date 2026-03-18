"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export default function PostVisitForm() {
  const router = useRouter();
  const params = useParams();
  const demandId = params.demandId as string;

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
        router.push("/"); // redirect o close
      }, 3000);
    } catch (err: any) {
      setError(err.message || "Ocurrió un error inesperado.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-green-600">¡Registrado con éxito!</CardTitle>
            <CardDescription>
              La evaluación de la visita ha sido guardada.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
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
                  <Label htmlFor="alto" className="cursor-pointer">Alto - Muy interesado</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="medio" id="medio" />
                  <Label htmlFor="medio" className="cursor-pointer">Medio - Lo considerará</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="bajo" id="bajo" />
                  <Label htmlFor="bajo" className="cursor-pointer">Bajo - No encaja</Label>
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
              <div className="text-sm text-red-500 font-medium">{error}</div>
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
  );
}
