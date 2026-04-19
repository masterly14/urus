"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Bot, CheckCircle2, AlertCircle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

interface ComercialToggle {
  comercialId: string;
  nombre: string;
  autoValidateMicrosite: boolean;
}

export function MicrositeAutoValidation() {
  const [comerciales, setComerciales] = useState<ComercialToggle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<Set<string>>(new Set());

  const fetchComerciales = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/comerciales/auto-validate-list");
      if (!res.ok) throw new Error("Error al cargar comerciales");
      const data = await res.json();
      setComerciales(data.comerciales);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchComerciales();
  }, [fetchComerciales]);

  const handleToggle = async (comercialId: string, newValue: boolean) => {
    setUpdating((prev) => new Set(prev).add(comercialId));

    try {
      const res = await fetch(
        `/api/comerciales/${comercialId}/auto-validate-toggle`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ autoValidateMicrosite: newValue }),
        },
      );

      if (!res.ok) throw new Error("Error al actualizar");

      setComerciales((prev) =>
        prev.map((c) =>
          c.comercialId === comercialId
            ? { ...c, autoValidateMicrosite: newValue }
            : c,
        ),
      );
    } catch {
      setComerciales((prev) =>
        prev.map((c) =>
          c.comercialId === comercialId
            ? { ...c, autoValidateMicrosite: !newValue }
            : c,
        ),
      );
    } finally {
      setUpdating((prev) => {
        const next = new Set(prev);
        next.delete(comercialId);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-48 items-center justify-center gap-2 text-destructive">
        <AlertCircle className="h-5 w-5" />
        <span>{error}</span>
      </div>
    );
  }

  const enabledCount = comerciales.filter((c) => c.autoValidateMicrosite).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Bot className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Auto-validación de Microsites</CardTitle>
              <CardDescription>
                Cuando está activa, los microsites del comercial se validan automáticamente
                con IA: se generan descripciones, se reemplazan referencias a otras agencias,
                y se envían al comprador sin esperar validación manual.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {enabledCount > 0 && (
            <div className="mb-4 flex items-center gap-2 rounded-md bg-primary/5 px-3 py-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span>
                {enabledCount} de {comerciales.length} comercial{comerciales.length !== 1 ? "es" : ""} con
                auto-validación activa
              </span>
            </div>
          )}

          <div className="divide-y divide-border/50">
            {comerciales.map((c) => (
              <div
                key={c.comercialId}
                className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">{c.nombre}</span>
                  {c.autoValidateMicrosite && (
                    <Badge variant="secondary" className="text-xs">
                      IA activa
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {updating.has(c.comercialId) && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  )}
                  <Switch
                    checked={c.autoValidateMicrosite}
                    onCheckedChange={(checked: boolean) =>
                      void handleToggle(c.comercialId, checked)
                    }
                    disabled={updating.has(c.comercialId)}
                    size="sm"
                  />
                </div>
              </div>
            ))}

            {comerciales.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No hay comerciales registrados.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground px-1">
        Cuando la auto-validación está desactivada, los microsites se envían al comercial para
        revisión manual antes de llegarle al comprador (comportamiento por defecto).
      </p>
    </div>
  );
}
