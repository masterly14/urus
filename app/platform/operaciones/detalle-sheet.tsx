"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { OperacionSummaryCard } from "@/components/operaciones/operacion-summary-card";

export function DetalleSheet({
  operacionId,
  onClose,
  onRefresh,
}: {
  operacionId: string;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/operaciones/${operacionId}`, { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `Error ${res.status}`);
        }
        return res.json();
      })
      .then((body) => {
        if (!cancelled) setData(body.operacion);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [operacionId]);

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        className="data-[side=right]:w-full data-[side=right]:sm:max-w-2xl overflow-y-auto p-0"
      >
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          <SheetTitle>{data?.codigo ?? "Operación"}</SheetTitle>
          <SheetDescription>Vista rápida de la operación</SheetDescription>
        </SheetHeader>

        {loading && (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
          </div>
        )}

        {error && (
          <div className="p-4 text-sm text-destructive">{error}</div>
        )}

        {data && (
          <div className="p-4 space-y-6">
            <OperacionSummaryCard data={data} />
            
            <div className="pt-2">
              <Button asChild className="w-full">
                <Link href={`/platform/operaciones/${operacionId}`} onClick={onClose}>
                  Abrir ficha completa
                </Link>
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
