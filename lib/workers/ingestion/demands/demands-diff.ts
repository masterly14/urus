import type { InmovillaDemand } from "@/lib/inmovilla/api/types-demands";
import type { DemandSnapshotData } from "./types";
import type { DemandSnapshotMap } from "./snapshot-repo";
import {
  DEMAND_DIFF_FIELDS,
  type DemandDiffField,
  type DemandDiffResult,
  type DemandCreatedChange,
  type DemandModifiedChange,
  type DemandStatusChangedChange,
  type DemandRemovedChange,
} from "./types";

function getChangedFields(
  prev: DemandSnapshotData,
  curr: InmovillaDemand,
): DemandDiffField[] {
  const changed: DemandDiffField[] = [];
  for (const field of DEMAND_DIFF_FIELDS) {
    if (prev[field] !== curr[field]) {
      changed.push(field);
    }
  }
  return changed;
}

function pickDiffFields(
  snapshot: DemandSnapshotData,
): Pick<InmovillaDemand, DemandDiffField> {
  return {
    nombre: snapshot.nombre,
    ref: snapshot.ref,
    estadoId: snapshot.estadoId,
    estadoNombre: snapshot.estadoNombre,
    presupuestoMin: snapshot.presupuestoMin,
    presupuestoMax: snapshot.presupuestoMax,
    habitacionesMin: snapshot.habitacionesMin,
    tipos: snapshot.tipos,
    zonas: snapshot.zonas,
    fechaActualizacion: snapshot.fechaActualizacion,
    agente: snapshot.agente,
    refConsultada: snapshot.refConsultada,
    telefono: snapshot.telefono as string | undefined,
  };
}

export function computeDemandDiff(
  currentDemands: InmovillaDemand[],
  previousSnapshot: DemandSnapshotMap,
): DemandDiffResult {
  const created: DemandCreatedChange[] = [];
  const modified: DemandModifiedChange[] = [];
  const statusChanged: DemandStatusChangedChange[] = [];
  const removed: DemandRemovedChange[] = [];
  let unchanged = 0;

  const currentCodigos = new Set(currentDemands.map((d) => d.codigo));

  for (const [codigo, prev] of previousSnapshot) {
    if (!currentCodigos.has(codigo)) {
      removed.push({
        type: "removed",
        codigo,
        previousEstadoId: prev.estadoId,
        previousEstadoNombre: prev.estadoNombre,
      });
    }
  }

  for (const demand of currentDemands) {
    const prev = previousSnapshot.get(demand.codigo);
    if (!prev) {
      created.push({ type: "created", demand });
      continue;
    }

    const changedFields = getChangedFields(prev, demand);
    if (changedFields.length === 0) {
      unchanged++;
      continue;
    }

    const estadoChanged = changedFields.includes("estadoId");
    if (estadoChanged) {
      statusChanged.push({
        type: "status_changed",
        demand,
        previousEstadoId: prev.estadoId,
        previousEstadoNombre: prev.estadoNombre,
        newEstadoId: demand.estadoId,
        newEstadoNombre: demand.estadoNombre,
        otherChangedFields: changedFields.filter(
          (field) => field !== "estadoId" && field !== "estadoNombre",
        ),
      });
    } else {
      modified.push({
        type: "modified",
        demand,
        before: pickDiffFields(prev),
        changedFields,
      });
    }
  }

  return { created, modified, statusChanged, removed, unchanged };
}
