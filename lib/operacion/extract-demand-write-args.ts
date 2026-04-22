import { prisma } from "@/lib/prisma";

export interface DemandWriteArgs {
  demandId: string;
  demandRef: string;
  clientId: string;
  agentId: string;
  propertyTypes: string;
}

const CLIENT_ID_KEYS = ["keycli", "cod_cli", "clientes-cod_cli", "clientes-cod_clipriclave"];
const AGENT_ID_KEYS = ["keyagente", "demandas-keyagente", "idUsuario", "agente"];
const PROPERTY_TYPE_KEYS = ["tipopropiedad", "tipos"];

function pickString(raw: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && v > 0) return String(v);
  }
  return null;
}

/**
 * Extrae los argumentos necesarios para ejecutar `WRITE_TO_INMOVILLA`
 * con operación `updateDemandStatus` a partir del `DemandSnapshot.raw`.
 *
 * Retorna `null` si el snapshot no existe o faltan `clientId`/`agentId`,
 * que son obligatorios para que `guardar.php` procese la escritura.
 */
export async function extractDemandWriteArgs(
  demandId: string,
): Promise<DemandWriteArgs | null> {
  const snapshot = await prisma.demandSnapshot.findUnique({
    where: { codigo: demandId },
    select: { ref: true, raw: true },
  });

  if (!snapshot) return null;

  const raw = (snapshot.raw ?? {}) as Record<string, unknown>;
  const clientId = pickString(raw, CLIENT_ID_KEYS);
  const agentId = pickString(raw, AGENT_ID_KEYS);

  if (!clientId || !agentId) return null;

  return {
    demandId,
    demandRef: snapshot.ref?.trim() || demandId,
    clientId,
    agentId,
    propertyTypes: pickString(raw, PROPERTY_TYPE_KEYS) ?? "",
  };
}
