"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Calendar,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  RefreshCcw,
  AlertTriangle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppSession } from "@/lib/hooks/use-session";

interface CalendarStatus {
  connected: boolean;
  connectedAt?: string | null;
  calendarProvider?: string;
  healthy?: boolean;
}

export function CalendarConnection() {
  const { user, isPending: sessionPending, isComercial } = useAppSession();
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flashMessage, setFlashMessage] = useState<
    "connected" | "failed" | null
  >(null);

  const comercialId = user?.comercialId ?? null;

  const isMock =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("mock") === "1";

  const fetchStatus = useCallback(async () => {
    if (!comercialId && !isMock) {
      setStatus(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (comercialId) params.set("comercialId", comercialId);
      if (isMock) params.set("mock", "1");

      const res = await fetch(`/api/composio/status?${params.toString()}`);
      if (!res.ok) throw new Error("Error al consultar estado");

      const data: CalendarStatus = await res.json();
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [comercialId, isMock]);

  useEffect(() => {
    if (sessionPending) return;
    void fetchStatus();
  }, [sessionPending, fetchStatus]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const calendarParam = params.get("calendar");
    if (calendarParam === "connected" || calendarParam === "failed") {
      setFlashMessage(calendarParam);
      const cleaned = new URL(window.location.href);
      cleaned.searchParams.delete("calendar");
      window.history.replaceState({}, "", cleaned.toString());

      if (calendarParam === "connected") {
        void fetchStatus();
      }
    }
  }, [fetchStatus]);

  const handleConnect = async () => {
    if (!comercialId && !isMock) return;
    setConnecting(true);
    setError(null);

    try {
      const params = isMock ? "?mock=1" : "";
      const res = await fetch(`/api/composio/connect${params}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comercialId: comercialId ?? "mock" }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Error al iniciar conexión");
      }

      const { redirectUrl } = await res.json();
      window.location.href = redirectUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      setConnecting(false);
    }
  };

  if (sessionPending) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!isComercial && !isMock) {
    return null;
  }

  const missingComercialLink = !comercialId && !isMock;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Google Calendar</CardTitle>
              <CardDescription>
                Conecta tu calendario para gestionar visitas automáticamente
              </CardDescription>
            </div>
          </div>
          {status?.connected && (
            <Badge
              variant={status.healthy ? "secondary" : "destructive"}
              className="gap-1"
            >
              {status.healthy ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <AlertTriangle className="h-3 w-3" />
              )}
              {status.healthy ? "Activo" : "Error de conexión"}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {flashMessage === "connected" && (
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/50 dark:text-green-200">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Calendario conectado correctamente. Las visitas se sincronizarán
            automáticamente.
          </div>
        )}
        {flashMessage === "failed" && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200">
            <XCircle className="h-4 w-4 shrink-0" />
            No se pudo conectar el calendario. Inténtalo de nuevo.
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {missingComercialLink ? (
          <div className="rounded-lg border border-amber-200/60 bg-amber-50/50 px-4 py-3 dark:border-amber-800/60 dark:bg-amber-950/30">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="space-y-1 text-sm text-amber-800 dark:text-amber-200">
                <p className="font-medium">
                  Configuración pendiente
                </p>
                <p className="text-amber-700 dark:text-amber-300">
                  Tu cuenta aún no está vinculada a una ficha de comercial.
                  Contacta a un administrador para que complete la vinculación
                  desde <strong>Configuración → Usuarios</strong>.
                </p>
              </div>
            </div>
          </div>
        ) : loading ? (
          <div className="flex items-center gap-2 py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Verificando estado del calendario...
            </span>
          </div>
        ) : status?.connected ? (
          <div className="space-y-3">
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div className="rounded-lg border border-border/60 px-3 py-2">
                <span className="text-muted-foreground">Proveedor</span>
                <p className="font-medium capitalize">
                  {status.calendarProvider ?? "Google"}
                </p>
              </div>
              <div className="rounded-lg border border-border/60 px-3 py-2">
                <span className="text-muted-foreground">Conectado desde</span>
                <p className="font-medium">
                  {status.connectedAt
                    ? new Date(status.connectedAt).toLocaleDateString("es-ES", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })
                    : "—"}
                </p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              Tu calendario está conectado. El sistema consultará
              automáticamente tu disponibilidad para proponer horarios de visita
              a los compradores.
            </p>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void fetchStatus()}
                className="gap-2"
              >
                <RefreshCcw className="h-3.5 w-3.5" />
                Verificar conexión
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleConnect}
                disabled={connecting}
                className="gap-2"
              >
                {connecting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ExternalLink className="h-3.5 w-3.5" />
                )}
                Reconectar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-200/60 bg-amber-50/50 px-4 py-3 dark:border-amber-800/60 dark:bg-amber-950/30">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Calendario no conectado
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Para que el sistema pueda agendar visitas automáticamente,
                    necesitas conectar tu Google Calendar. Esto permite consultar
                    tu disponibilidad y crear eventos de visita directamente en
                    tu calendario.
                  </p>
                </div>
              </div>
            </div>

            <Button
              onClick={handleConnect}
              disabled={connecting}
              className="gap-2"
            >
              {connecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Calendar className="h-4 w-4" />
              )}
              {connecting
                ? "Redirigiendo a Google..."
                : "Conectar Google Calendar"}
            </Button>

            <p className="text-xs text-muted-foreground">
              Se te redirigirá a Google para autorizar el acceso de solo lectura
              y escritura a tu calendario. Puedes revocar el acceso en cualquier
              momento.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
