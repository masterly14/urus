import type { InmovillaProperty } from "@/lib/inmovilla/api/types";
import type { PropertySnapshotData } from "./types";
import type { SnapshotMap } from "./snapshot-repo";
import {
  DIFF_FIELDS,
  type DiffField,
  type PropertyDiffResult,
  type PropertyCreatedChange,
  type PropertyModifiedChange,
  type PropertyStatusChangedChange,
} from "./types";

function getChangedFields(
  prev: PropertySnapshotData,
  curr: InmovillaProperty,
): DiffField[] {
  const changed: DiffField[] = [];
  for (const field of DIFF_FIELDS) {
    if (prev[field] !== curr[field]) {
      changed.push(field);
    }
  }
  return changed;
}

function pickDiffFields(
  snapshot: PropertySnapshotData,
): Pick<InmovillaProperty, DiffField> {
  return {
    precio: snapshot.precio,
    metrosConstruidos: snapshot.metrosConstruidos,
    habitaciones: snapshot.habitaciones,
    banyos: snapshot.banyos,
    ciudad: snapshot.ciudad,
    zona: snapshot.zona,
    estado: snapshot.estado,
    fechaActualizacion: snapshot.fechaActualizacion,
  };
}

export function computePropertyDiff(
  currentProperties: InmovillaProperty[],
  previousSnapshot: SnapshotMap,
): PropertyDiffResult {
  const created: PropertyCreatedChange[] = [];
  const modified: PropertyModifiedChange[] = [];
  const statusChanged: PropertyStatusChangedChange[] = [];
  let unchanged = 0;

  for (const property of currentProperties) {
    const prev = previousSnapshot.get(property.codigo);

    if (!prev) {
      created.push({ type: "created", property });
      continue;
    }

    const changedFields = getChangedFields(prev, property);

    if (changedFields.length === 0) {
      unchanged++;
      continue;
    }

    const estadoChanged = changedFields.includes("estado");

    if (estadoChanged) {
      statusChanged.push({
        type: "status_changed",
        property,
        previousEstado: prev.estado,
        newEstado: property.estado,
        otherChangedFields: changedFields.filter((f) => f !== "estado"),
      });
    } else {
      modified.push({
        type: "modified",
        property,
        before: pickDiffFields(prev),
        changedFields,
      });
    }
  }

  return { created, modified, statusChanged, unchanged };
}
