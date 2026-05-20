"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertTriangle, ArrowRight, Info } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from "@/components/ui/combobox";

export interface ComercialCandidate {
  id: string;
  nombre: string;
  ciudad: string;
  inmovillaAgentId: number | null;
}

export interface UserToDelete {
  id: string;
  name: string;
  email: string;
  comercialId?: string | null;
}

interface DeleteComercialDialogProps {
  user: UserToDelete | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

interface PreviewData {
  propertyCount: number;
  demandCount: number;
}

type DialogPhase = "loading" | "ready" | "confirming" | "error";
type SuccessSummary = {
  transferred: { properties: number; demands: number };
  manualTasks: { total: number; properties: number; demands: number };
};

export function DeleteComercialDialog({
  user,
  open,
  onOpenChange,
  onDeleted,
}: DeleteComercialDialogProps) {
  const router = useRouter();
  const [phase, setPhase] = React.useState<DialogPhase>("loading");
  const [preview, setPreview] = React.useState<PreviewData | null>(null);
  const [candidates, setCandidates] = React.useState<ComercialCandidate[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [successSummary, setSuccessSummary] = React.useState<SuccessSummary | null>(null);

  const candidateMap = React.useMemo(
    () => new Map(candidates.map((c) => [c.id, c])),
    [candidates],
  );

  React.useEffect(() => {
    if (!open || !user) return;

    setPhase("loading");
    setPreview(null);
    setCandidates([]);
    setSelectedId(null);
    setErrorMsg(null);
    setSuccessSummary(null);

    const excludeParam = user.comercialId ? `&excludeId=${encodeURIComponent(user.comercialId)}` : "";

    Promise.all([
      fetch(`/api/users/${encodeURIComponent(user.id)}/transfer-preview`),
      fetch(`/api/comerciales?${excludeParam}`),
    ])
      .then(async ([previewRes, candidatesRes]) => {
        const [previewData, candidatesData] = await Promise.all([
          previewRes.json(),
          candidatesRes.json(),
        ]);

        if (!previewRes.ok || !previewData.ok) {
          throw new Error(previewData.error ?? "Error al cargar datos del comercial");
        }

        setPreview({
          propertyCount: previewData.propertyCount ?? 0,
          demandCount: previewData.demandCount ?? 0,
        });
        setCandidates((candidatesData.comerciales as ComercialCandidate[]) ?? []);
        setPhase("ready");
      })
      .catch((err: unknown) => {
        setErrorMsg(err instanceof Error ? err.message : "Error inesperado");
        setPhase("error");
      });
  }, [open, user]);

  async function handleConfirm() {
    if (!user) return;
    setPhase("confirming");
    setErrorMsg(null);

    try {
      const body: Record<string, unknown> = {};
      if (selectedId) body.transferTo = selectedId;

      const res = await fetch(`/api/users/${encodeURIComponent(user.id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        transferred?: { properties?: number; demands?: number };
        manualTasks?: { total?: number; properties?: number; demands?: number };
      };

      if (!res.ok || !data.ok) {
        setErrorMsg(data.error ?? "No se pudo eliminar el comercial");
        setPhase("ready");
        return;
      }

      setSuccessSummary({
        transferred: {
          properties: data.transferred?.properties ?? 0,
          demands: data.transferred?.demands ?? 0,
        },
        manualTasks: {
          total: data.manualTasks?.total ?? 0,
          properties: data.manualTasks?.properties ?? 0,
          demands: data.manualTasks?.demands ?? 0,
        },
      });
      setPhase("ready");
    } catch {
      setErrorMsg("Error de red al eliminar el comercial");
      setPhase("ready");
    }
  }

  const hasAssignments = (preview?.propertyCount ?? 0) > 0 || (preview?.demandCount ?? 0) > 0;
  const targetComercial = selectedId ? candidateMap.get(selectedId) : null;
  const targetMissingInmovilla = targetComercial !== undefined && targetComercial?.inmovillaAgentId == null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-[480px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            Eliminar comercial
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <span>
              Vas a eliminar a <strong>{user?.name}</strong> ({user?.email}).
              Esta acción no se puede deshacer.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {phase === "loading" && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Cargando datos del comercial…</span>
          </div>
        )}

        {phase === "error" && (
          <p className="text-sm text-destructive" role="alert">
            {errorMsg}
          </p>
        )}

        {(phase === "ready" || phase === "confirming") && preview !== null && !successSummary && (
          <div className="space-y-4">
            {hasAssignments ? (
              <>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                    Este comercial tiene asignaciones activas:
                  </p>
                  <ul className="mt-1.5 space-y-0.5 text-sm text-amber-700 dark:text-amber-400">
                    {preview.propertyCount > 0 && (
                      <li>
                        · <strong>{preview.propertyCount}</strong>{" "}
                        {preview.propertyCount === 1 ? "propiedad" : "propiedades"}
                      </li>
                    )}
                    {preview.demandCount > 0 && (
                      <li>
                        · <strong>{preview.demandCount}</strong>{" "}
                        {preview.demandCount === 1 ? "demanda" : "demandas"}
                      </li>
                    )}
                  </ul>
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-500">
                    Selecciona un comercial destino para transferirlas, o déjalas sin asignar.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="transfer-combobox-input">
                    Transferir a{" "}
                    <span className="font-normal text-muted-foreground">(opcional)</span>
                  </Label>
                  <Combobox
                    value={selectedId ?? ""}
                    onValueChange={(val) =>
                      setSelectedId(typeof val === "string" && val ? val : null)
                    }
                    disabled={phase === "confirming"}
                    filter={(optionValue, inputValue) => {
                      if (!inputValue) return true;
                      const c = candidateMap.get(optionValue);
                      if (!c) return false;
                      return `${c.nombre} ${c.ciudad}`
                        .toLowerCase()
                        .includes(inputValue.toLowerCase());
                    }}
                  >
                    <ComboboxInput
                      id="transfer-combobox-input"
                      placeholder="Buscar comercial por nombre o ciudad…"
                      showClear={!!selectedId}
                      className="w-full"
                      disabled={phase === "confirming"}
                    />
                    <ComboboxContent>
                      <ComboboxList>
                        <ComboboxEmpty>Sin coincidencias</ComboboxEmpty>
                        {candidates.map((c) => (
                          <ComboboxItem key={c.id} value={c.id}>
                            <span className="font-medium">{c.nombre}</span>
                            <span className="ml-1.5 text-xs text-muted-foreground">
                              ({c.ciudad})
                            </span>
                          </ComboboxItem>
                        ))}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>

                  {targetMissingInmovilla && (
                    <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-500">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Este comercial no tiene ID en Inmovilla. La transferencia se realizará
                      solo en la base de datos local; la sincronización con Inmovilla no se
                      ejecutará.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Info className="h-4 w-4 shrink-0" />
                  Este comercial no tiene propiedades ni demandas asignadas. Se puede
                  eliminar directamente.
                </p>
              </div>
            )}

            {selectedId && targetComercial && (
              <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">Transferir a:</span>
                <span className="font-medium">{targetComercial.nombre}</span>
                <span className="text-xs text-muted-foreground">({targetComercial.ciudad})</span>
              </div>
            )}

            {errorMsg && (
              <p className="text-sm text-destructive" role="alert">
                {errorMsg}
              </p>
            )}
          </div>
        )}

        {successSummary && (
          <div className="space-y-3 rounded-lg border border-urus-success/30 bg-urus-success-bg p-3 text-sm">
            <p className="font-medium text-urus-success">
              Comercial eliminado y transferencia local completada.
            </p>
            <p className="text-muted-foreground">
              Se reasignaron {successSummary.transferred.properties} propiedades y{" "}
              {successSummary.transferred.demands} demandas.
            </p>
            <p className="text-muted-foreground">
              Se crearon {successSummary.manualTasks.total} tareas manuales de sincronización
              ({successSummary.manualTasks.properties} de propiedades y{" "}
              {successSummary.manualTasks.demands} de demandas).
            </p>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={phase === "confirming" || phase === "loading"}
            onClick={() => {
              if (successSummary) onDeleted();
            }}
          >
            Cancelar
          </AlertDialogCancel>
          {successSummary ? (
            <Button
              onClick={() => {
                onOpenChange(false);
                onDeleted();
                router.push("/platform/configuracion/tareas-sincronizacion");
              }}
            >
              Ir a tareas de sincronización
            </Button>
          ) : (
            <Button
              variant="destructive"
              disabled={phase === "loading" || phase === "confirming" || phase === "error"}
              onClick={() => void handleConfirm()}
            >
              {phase === "confirming" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Eliminando…
                </>
              ) : (
                "Eliminar comercial"
              )}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
