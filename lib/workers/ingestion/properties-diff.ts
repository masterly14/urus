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
  type PropertyRemovedChange,
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
    nodisponible: snapshot.nodisponible,
    prospecto: snapshot.prospecto,
    fechaActualizacion: snapshot.fechaActualizacion,
    agente: snapshot.agente,
  };
}

export function computePropertyDiff(
  currentProperties: InmovillaProperty[],
  previousSnapshot: SnapshotMap,
): PropertyDiffResult {
  const created: PropertyCreatedChange[] = [];
  const modified: PropertyModifiedChange[] = [];
  const statusChanged: PropertyStatusChangedChange[] = [];
  const removed: PropertyRemovedChange[] = [];
  let unchanged = 0;

  // Códigos presentes en el ciclo actual (ya filtrados a Libre)
  const currentCodigos = new Set(currentProperties.map((p) => p.codigo));

  // Propiedades en snapshot previo que ya no aparecen en el fetch actual.
  // Solo emitir PROPIEDAD_ELIMINADA si la propiedad no estaba en un estado
  // filtrado (nodisponible/prospecto). Esos estados se excluyen del fetch REST
  // en listadoDiff, así que su ausencia no implica eliminación real.
  const FILTERED_NOT_REMOVED_STATES = new Set(["nodisponible", "prospecto"]);

  for (const [codigo, prev] of previousSnapshot) {
    if (!currentCodigos.has(codigo)) {
      if (prev.nodisponible || prev.prospecto || FILTERED_NOT_REMOVED_STATES.has(prev.estado?.toLowerCase())) {
        continue;
      }
      removed.push({ type: "removed", codigo, previousEstado: prev.estado });
    }
  }

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

  return { created, modified, statusChanged, removed, unchanged };
}
