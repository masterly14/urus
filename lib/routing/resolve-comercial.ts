/**
 * Resolver centralizado: Inmovilla agent → Comercial interno.
 *
 * Cadena de prioridad:
 * 1. comercialId directo (FK, si ya se conoce)
 * 2. inmovillaAgentId (keyagente numérico, match estable)
 * 3. nombre textual (insensitive + trim, fallback legacy)
 *
 * Todos los módulos que necesitan resolver un comercial DEBEN usar
 * esta función en lugar de hacer queries ad-hoc.
 */

import { prisma } from "@/lib/prisma";
import type { Comercial } from "@/app/generated/prisma/client";

export interface ResolveComercialInput {
  comercialId?: string | null;
  inmovillaAgentId?: number | null;
  agenteName?: string | null;
  requireActive?: boolean;
}

type ComercialBasic = Pick<
  Comercial,
  "id" | "nombre" | "telefono" | "email" | "ciudad" | "waId" | "composioConnectionId" | "activo" | "inmovillaAgentId"
>;

const BASIC_SELECT = {
  id: true,
  nombre: true,
  telefono: true,
  email: true,
  ciudad: true,
  waId: true,
  composioConnectionId: true,
  activo: true,
  inmovillaAgentId: true,
} as const;

/**
 * Resuelve un Comercial desde cualquier identificador disponible.
 *
 * @example
 * // Desde keyagente de Inmovilla (ingesta REST)
 * const c = await resolveComercial({ inmovillaAgentId: 12326 });
 *
 * // Desde nombre (legacy / snapshots)
 * const c = await resolveComercial({ agenteName: "Antonio Piedraita" });
 *
 * // Desde comercialId conocido (FK en sesión de visita, operación, etc.)
 * const c = await resolveComercial({ comercialId: "clxyz123" });
 */
export async function resolveComercial(
  input: ResolveComercialInput,
): Promise<ComercialBasic | null> {
  const active = input.requireActive ?? true;

  if (input.comercialId) {
    const result = await prisma.comercial.findUnique({
      where: { id: input.comercialId },
      select: BASIC_SELECT,
    });
    if (result && (!active || result.activo)) return result;
  }

  if (input.inmovillaAgentId != null) {
    const result = await prisma.comercial.findUnique({
      where: { inmovillaAgentId: input.inmovillaAgentId },
      select: BASIC_SELECT,
    });
    if (result && (!active || result.activo)) return result;
  }

  const nombre = input.agenteName?.trim();
  if (nombre) {
    const result = await prisma.comercial.findFirst({
      where: {
        nombre: { equals: nombre, mode: "insensitive" },
        ...(active ? { activo: true } : {}),
      },
      select: BASIC_SELECT,
    });
    if (result) return result;
  }

  return null;
}

/**
 * Resuelve un Comercial a partir de un string `agente` de Inmovilla,
 * que puede ser un keyagente numérico (REST) o un nombre (legacy).
 */
export async function resolveComercialFromAgente(
  agente: string | null | undefined,
  opts?: { requireActive?: boolean },
): Promise<ComercialBasic | null> {
  const raw = (agente ?? "").trim();
  if (!raw) return null;

  const asNum = parseInt(raw, 10);
  if (!isNaN(asNum) && String(asNum) === raw) {
    return resolveComercial({
      inmovillaAgentId: asNum,
      agenteName: raw,
      requireActive: opts?.requireActive,
    });
  }

  return resolveComercial({
    agenteName: raw,
    requireActive: opts?.requireActive,
  });
}

/**
 * Resuelve el comercial asignado a una propiedad.
 * Usa PropertyCurrent.comercialId si existe, o fallback a agente string.
 */
export async function resolveComercialByProperty(
  propertyCode: string,
): Promise<ComercialBasic | null> {
  const property = await prisma.propertyCurrent.findUnique({
    where: { codigo: propertyCode },
    select: { agente: true, comercialId: true },
  });
  if (!property) return null;

  if (property.comercialId) {
    const result = await resolveComercial({ comercialId: property.comercialId });
    if (result) return result;
  }

  return resolveComercialFromAgente(property.agente);
}

/**
 * Resuelve el comercial asignado a una demanda.
 * Usa DemandCurrent.comercialId si existe, o fallback a agente string.
 */
export async function resolveComercialByDemand(
  demandCodigo: string,
): Promise<ComercialBasic | null> {
  const demand = await prisma.demandCurrent.findUnique({
    where: { codigo: demandCodigo },
    select: { agente: true, comercialId: true },
  });
  if (!demand) return null;

  if (demand.comercialId) {
    const result = await resolveComercial({ comercialId: demand.comercialId });
    if (result) return result;
  }

  return resolveComercialFromAgente(demand.agente);
}
