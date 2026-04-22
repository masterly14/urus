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
      <div className="flex items-center justify-between gap-4 rounded-lg border border-urus-warning/30 bg-urus-warning-bg px-4 py-3 text-sm">
        <div className="flex items-center gap-2.5 text-urus-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            <span className="font-medium">Datos financieros incompletos: </span>
            faltan los datos del corte de {missingLabels}.
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 border-urus-warning/50 bg-card text-urus-warning hover:bg-urus-warning-bg"
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
