"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Users, Loader2 } from "lucide-react";

interface ReferralFormProps {
  propertyCode: string;
  referrerName: string;
}

export function ReferralForm({ propertyCode, referrerName }: ReferralFormProps) {
  const [referredName, setReferredName] = useState("");
  const [referredPhone, setReferredPhone] = useState("");
  const [referredEmail, setReferredEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = referredName.trim().length > 0 && referredPhone.trim().length >= 9;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/referidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyCode,
          referredName: referredName.trim(),
          referredPhone: referredPhone.trim(),
          referredEmail: referredEmail.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error al enviar");
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <Card className="max-w-md mx-auto">
        <CardContent className="p-8 text-center space-y-4">
          <div className="mx-auto h-16 w-16 rounded-full bg-[var(--urus-success)]/15 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-[var(--urus-success)]" />
          </div>
          <h2 className="text-xl font-semibold">Gracias por su recomendación</h2>
          <p className="text-sm text-muted-foreground">
            Nos pondremos en contacto con su conocido lo antes posible.
            Agradecemos su confianza en URUS Capital.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-lg bg-secondary/15 flex items-center justify-center">
            <Users className="h-5 w-5 text-secondary" />
          </div>
          <div>
            <CardTitle className="text-lg">Recomendar a un conocido</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Hola{referrerName ? ` ${referrerName}` : ""}, gracias por confiar en URUS Capital
            </p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Indíquenos los datos de la persona que desea recomendar y nos pondremos en contacto con ella.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="referredName">Nombre completo *</Label>
            <Input
              id="referredName"
              placeholder="Nombre y apellidos"
              value={referredName}
              onChange={(e) => setReferredName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="referredPhone">Teléfono *</Label>
            <Input
              id="referredPhone"
              type="tel"
              placeholder="Ej: 612 345 678"
              value={referredPhone}
              onChange={(e) => setReferredPhone(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="referredEmail">Email (opcional)</Label>
            <Input
              id="referredEmail"
              type="email"
              placeholder="correo@ejemplo.com"
              value={referredEmail}
              onChange={(e) => setReferredEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Nota o comentario (opcional)</Label>
            <Textarea
              id="notes"
              placeholder="Ej: Está buscando piso en la zona centro..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={!canSubmit || submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Enviando...
              </>
            ) : (
              "Enviar recomendación"
            )}
          </Button>

          <p className="text-[10px] text-muted-foreground text-center">
            Al enviar, consiente que contactemos a la persona indicada de su parte.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
