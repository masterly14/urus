/**
 * Sincronización automática: al crear/activar un Comercial, asigna
 * PropertyCurrent y DemandCurrent que le corresponden pero tienen
 * comercialId = null.
 *
 * Criterios de match (misma cadena que resolve-comercial):
 *   1. inmovillaAgentId  → PropertyCurrent.agente es numérico y coincide
 *   2. inmovillaRefCode  → extractRefCode(ref) coincide (URUS111VMA → "MA")
 *   3. nombre             → PropertyCurrent.agente coincide (case-insensitive)
 */

import { prisma } from "@/lib/prisma";
import { extractRefCode } from "./parse-ref-code";

export interface SyncComercialResult {
  propertiesAssigned: number;
  demandsAssigned: number;
}

interface ComercialIdentifiers {
  id: string;
  nombre: string;
  inmovillaAgentId: number | null;
  inmovillaRefCode: string | null;
}

export async function syncComercialAssignments(
  comercial: ComercialIdentifiers,
): Promise<SyncComercialResult> {
  const { id, nombre, inmovillaAgentId, inmovillaRefCode } = comercial;
  const refCode = inmovillaRefCode?.trim().toUpperCase() || null;

  let propertiesAssigned = 0;
  let demandsAssigned = 0;

  // --- Properties ---

  const unassignedProps = await prisma.propertyCurrent.findMany({
    where: { comercialId: null },
    select: { codigo: true, agente: true, ref: true },
  });

  for (const prop of unassignedProps) {
    if (matchesComercial(prop.agente, prop.ref, inmovillaAgentId, refCode, nombre)) {
      await prisma.propertyCurrent.update({
        where: { codigo: prop.codigo },
        data: { comercialId: id, agente: nombre },
      });
      propertiesAssigned++;
    }
  }

  // --- Demands ---

  const unassignedDemands = await prisma.demandCurrent.findMany({
    where: { comercialId: null },
    select: { codigo: true, agente: true, ref: true },
  });

  for (const dem of unassignedDemands) {
    if (matchesComercial(dem.agente, dem.ref, inmovillaAgentId, refCode, nombre)) {
      await prisma.demandCurrent.update({
        where: { codigo: dem.codigo },
        data: { comercialId: id, agente: nombre },
      });
      demandsAssigned++;
    }
  }

  if (propertiesAssigned > 0 || demandsAssigned > 0) {
    console.log(
      `[sync-comercial] comercialId=${id} nombre="${nombre}" refCode=${refCode ?? "—"} agentId=${inmovillaAgentId ?? "—"} → propiedades=${propertiesAssigned} demandas=${demandsAssigned}`,
    );
  }

  return { propertiesAssigned, demandsAssigned };
}

function matchesComercial(
  agente: string,
  ref: string,
  inmovillaAgentId: number | null,
  refCode: string | null,
  nombre: string,
): boolean {
  const trimmed = agente?.trim() ?? "";

  if (inmovillaAgentId != null && trimmed) {
    const asNum = parseInt(trimmed, 10);
    if (!isNaN(asNum) && String(asNum) === trimmed && asNum === inmovillaAgentId) {
      return true;
    }
  }

  if (refCode && ref) {
    const extracted = extractRefCode(ref);
    if (extracted === refCode) {
      return true;
    }
  }

  if (trimmed && nombre && trimmed.toLowerCase() === nombre.toLowerCase()) {
    return true;
  }

  return false;
}
