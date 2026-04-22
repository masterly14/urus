import { prisma } from "@/lib/prisma";

const CLIENT_CODE_KEYS = [
  "keycli",
  "cod_cli",
  "clientes-cod_cli",
  "clientes-cod_clipriclave",
];

/**
 * Resuelve el `cod_cli` numérico de Inmovilla del comprador asociado a una
 * operación. Intenta en orden:
 *
 *   1. `operacion.buyerClientId` si es un valor numérico
 *   2. `DemandSnapshot.raw` del `demandId` asociado, buscando claves típicas
 *
 * Retorna `null` si no se puede resolver.
 */
export async function resolveBuyerClientCode(
  buyerClientId: string | null,
  demandId: string | null,
): Promise<string | null> {
  if (buyerClientId) {
    const numeric = Number(buyerClientId);
    if (Number.isFinite(numeric) && numeric > 0) {
      return String(numeric);
    }
  }

  if (!demandId) return null;

  const snapshot = await prisma.demandSnapshot.findUnique({
    where: { codigo: demandId },
    select: { raw: true },
  });

  if (!snapshot) return null;

  const raw = (snapshot.raw ?? {}) as Record<string, unknown>;
  for (const key of CLIENT_CODE_KEYS) {
    const v = raw[key];
    if (typeof v === "string" && v.trim()) {
      const n = Number(v.trim());
      if (Number.isFinite(n) && n > 0) return String(n);
    }
    if (typeof v === "number" && v > 0) return String(v);
  }

  return null;
}
