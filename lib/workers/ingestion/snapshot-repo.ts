import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { InmovillaProperty } from "@/lib/inmovilla/api/types";
import type { PropertySnapshotData } from "./types";
import { classifyError } from "./errors";

/**
 * Ejecuta `fn` con reintentos exponenciales ante errores de base de datos
 * transitorios (DB_ERROR). Máx. 3 intentos con espera 1s → 2s → 4s.
 */
async function withDbRetry<T>(
  fn: () => Promise<T>,
  label: string,
): Promise<T> {
  const MAX_RETRIES = 3;
  const BASE_DELAY_MS = 1_000;

  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      const classified = classifyError(err);
      if (!classified.retryable || classified.code !== "DB_ERROR" || attempt >= MAX_RETRIES) {
        throw err;
      }
      const waitMs = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.warn(
        `[snapshot-repo] ${label} — DB error (intento ${attempt}/${MAX_RETRIES}), reintentando en ${waitMs}ms: ${classified.message}`,
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

export type SnapshotMap = Map<string, PropertySnapshotData>;

function str(v: unknown): string {
  return v != null && v !== "" ? String(v) : "";
}

function toSnapshotData(p: InmovillaProperty): PropertySnapshotData {
  return {
    codigo: str(p.codigo),
    ref: str(p.ref),
    titulo: str(p.titulo),
    tipoOfer: str(p.tipoOfer),
    precio: Number(p.precio) || 0,
    metrosConstruidos: Number(p.metrosConstruidos) || 0,
    habitaciones: Number(p.habitaciones) || 0,
    banyos: Number(p.banyos) || 0,
    ciudad: str(p.ciudad),
    zona: str(p.zona),
    estado: str(p.estado),
    nodisponible: Boolean(p.nodisponible),
    prospecto: Boolean(p.prospecto),
    fechaAlta: str(p.fechaAlta),
    fechaActualizacion: str(p.fechaActualizacion),
    numFotos: Number(p.numFotos) || 0,
    agente: str(p.agente),
    mainPhotoUrl: p.mainPhotoUrl ?? null,
    raw: p.raw && typeof p.raw === "object" ? p.raw : undefined,
  };
}

/** `true` si el objeto `raw` tiene al menos una clave útil (no es `{}` vacío). */
function hasMeaningfulRaw(raw: unknown): boolean {
  return (
    !!raw &&
    typeof raw === "object" &&
    Object.keys(raw as Record<string, unknown>).length > 0
  );
}

/** Hard cap to prevent OOM on unbounded snapshot load. Sized for current catalogue (~5k properties). */
const SNAPSHOT_LOAD_LIMIT = 10_000;

export async function loadPreviousSnapshot(): Promise<SnapshotMap> {
  const rows = await withDbRetry(
    () => prisma.propertySnapshot.findMany({ take: SNAPSHOT_LOAD_LIMIT }),
    "loadPreviousSnapshot",
  );
  const map: SnapshotMap = new Map();
  for (const row of rows) {
    map.set(row.codigo, {
      codigo: row.codigo,
      ref: row.ref,
      titulo: row.titulo,
      tipoOfer: row.tipoOfer,
      precio: row.precio,
      metrosConstruidos: row.metrosConstruidos,
      habitaciones: row.habitaciones,
      banyos: row.banyos,
      ciudad: row.ciudad,
      zona: row.zona,
      estado: row.estado,
      nodisponible: row.nodisponible,
      prospecto: row.prospecto,
      fechaAlta: row.fechaAlta,
      fechaActualizacion: row.fechaActualizacion,
      numFotos: row.numFotos,
      agente: row.agente,
      mainPhotoUrl: row.mainPhotoUrl ?? null,
      raw: hasMeaningfulRaw(row.raw)
        ? (row.raw as Record<string, unknown>)
        : undefined,
    });
  }
  return map;
}

/**
 * Elimina del snapshot las propiedades que ya no son Libre (removidas del ciclo).
 * Se llama con los códigos detectados como `removed` en el diff.
 */
export async function removeFromSnapshot(codes: string[]): Promise<void> {
  if (codes.length === 0) return;
  await withDbRetry(
    () => prisma.propertySnapshot.deleteMany({ where: { codigo: { in: codes } } }),
    "removeFromSnapshot",
  );
}

export async function saveCurrentSnapshot(
  properties: InmovillaProperty[],
  now?: Date,
): Promise<void> {
  const ts = now ?? new Date();

  await withDbRetry(
    () =>
      prisma.$transaction(
        properties.map((p) => {
          const data = toSnapshotData(p);
          // Solo persistir un `raw` nuevo si contiene algo útil. De lo contrario
          // conservamos el `raw` previamente guardado en DB: así los ciclos
          // `unchanged` (que no re-fetchean) no destruyen el JSON crudo que
          // scripts de backfill/enriquecimiento necesitan (key_loca, key_zona, cp…).
          const nextRaw = hasMeaningfulRaw(p.raw)
            ? (p.raw as Prisma.InputJsonValue)
            : null;

          // Extraer `raw` del spread para no duplicar la clave en update.
          const snapshotFieldsWithoutRaw: Omit<PropertySnapshotData, "raw"> = {
            codigo: data.codigo,
            ref: data.ref,
            titulo: data.titulo,
            tipoOfer: data.tipoOfer,
            precio: data.precio,
            metrosConstruidos: data.metrosConstruidos,
            habitaciones: data.habitaciones,
            banyos: data.banyos,
            ciudad: data.ciudad,
            zona: data.zona,
            estado: data.estado,
            nodisponible: data.nodisponible,
            prospecto: data.prospecto,
            fechaAlta: data.fechaAlta,
            fechaActualizacion: data.fechaActualizacion,
            numFotos: data.numFotos,
            agente: data.agente,
            mainPhotoUrl: data.mainPhotoUrl ?? null,
          };

          return prisma.propertySnapshot.upsert({
            where: { codigo: p.codigo },
            create: {
              ...snapshotFieldsWithoutRaw,
              raw: (nextRaw ?? {}) as Prisma.InputJsonValue,
              firstSeenAt: ts,
              lastSeenAt: ts,
            },
            update: {
              ...snapshotFieldsWithoutRaw,
              ...(nextRaw !== null ? { raw: nextRaw } : {}),
              lastSeenAt: ts,
            },
          });
        }),
      ),
    "saveCurrentSnapshot",
  );
}
