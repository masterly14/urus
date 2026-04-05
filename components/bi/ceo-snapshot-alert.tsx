"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CeoSnapshotModal } from "@/components/bi/ceo-snapshot-modal";
import { useCeoSnapshotStatus } from "@/lib/hooks/use-ceo-snapshot-status";
import type { SnapshotPeriodStatus } from "@/lib/dashboard/ceo/types";

export function CeoSnapshotAlert() {
  const { data, loading, refetch } = useCeoSnapshotStatus();
  const [modalOpen, setModalOpen] = useState(false);
  const [defaultPeriod, setDefaultPeriod] = useState<string | undefined>();

  // No mostrar nada mientras carga o si todos los datos están completos
  if (loading || !data || !data.needsData) return null;

  const missingPeriods: SnapshotPeriodStatus[] = [
    !data.previous.hasData ? data.previous : null,
    !data.current.hasData ? data.current : null,
  ].filter((p): p is SnapshotPeriodStatus => p !== null);

  const allPeriods: SnapshotPeriodStatus[] = [data.previous, data.current];

  function openModal(period?: string) {
    setDefaultPeriod(period ?? missingPeriods[0]?.period);
    setModalOpen(true);
  }

  const missingLabels = missingPeriods.map((p) => p.label).join(" y ");

  return (
    <>
      <div className="flex items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800/50 dark:bg-amber-900/10">
        <div className="flex items-center gap-2.5 text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            <span className="font-medium">Datos financieros incompletos: </span>
            faltan los datos del corte de {missingLabels}.
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 border-amber-300 bg-white text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-transparent dark:text-amber-300 dark:hover:bg-amber-900/30"
          onClick={() => openModal()}
        >
          Rellenar datos
        </Button>
      </div>

      <CeoSnapshotModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        periods={allPeriods}
        defaultPeriod={defaultPeriod}
        onSuccess={refetch}
      />
    </>
  );
}
