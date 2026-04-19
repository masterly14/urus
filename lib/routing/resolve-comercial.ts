/**
 * Resolver centralizado: Inmovilla agent → Comercial interno.
 *
 * Cadena de prioridad:
 * 1. comercialId directo (FK, si ya se conoce)
 * 2. inmovillaAgentId (keyagente numérico, match estable)
 * 3. inmovillaRefCode (iniciales de la ref, ej. "MA" en URUS111VMA)
 * 4. nombre textual (insensitive + trim, fallback legacy)
 *
 * Todos los módulos que necesitan resolver un comercial DEBEN usar
 * esta función en lugar de hacer queries ad-hoc.
 */

import { prisma } from "@/lib/prisma";
import type { Comercial } from "@/app/generated/prisma/client";
import { extractRefCode } from "./parse-ref-code";

export interface ResolveComercialInput {
  comercialId?: string | null;
  inmovillaAgentId?: number | null;
  refCode?: string | null;
  agenteName?: string | null;
  requireActive?: boolean;
  /**
   * Si se define, escribe en consola cada paso de la resolución (depuración).
   * Ej.: `demand:37828509`
   */
  traceContext?: string;
}

function traceLog(ctx: string | undefined, message: string): void {
  if (!ctx) return;
  console.log(`[resolve-comercial] ${ctx} ${message}`);
}

type ComercialBasic = Pick<
  Comercial,
  "id" | "nombre" | "telefono" | "email" | "ciudad" | "waId" | "composioConnectionId" | "activo" | "inmovillaAgentId" | "inmovillaRefCode"
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
  inmovillaRefCode: true,
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
  const ctx = input.traceContext;

  traceLog(
    ctx,
    `entrada comercialId=${input.comercialId ?? "—"} inmovillaAgentId=${input.inmovillaAgentId ?? "—"} refCode=${input.refCode ?? "—"} agenteName=${JSON.stringify(input.agenteName ?? "")} requireActive=${active}`,
  );

  if (input.comercialId) {
    const result = await prisma.comercial.findUnique({
      where: { id: input.comercialId },
      select: BASIC_SELECT,
    });
    if (result && (!active || result.activo)) {
      traceLog(ctx, `match por comercialId → id=${result.id} nombre=${JSON.stringify(result.nombre)}`);
      return result;
    }
    traceLog(
      ctx,
      result
        ? `comercialId encontrado pero inactivo o filtrado (activo=${result.activo})`
        : "comercialId sin fila en BD",
    );
  } else {
    traceLog(ctx, "paso comercialId omitido (vacío)");
  }

  if (input.inmovillaAgentId != null) {
    const result = await prisma.comercial.findUnique({
      where: { inmovillaAgentId: input.inmovillaAgentId },
      select: BASIC_SELECT,
    });
    if (result && (!active || result.activo)) {
      traceLog(
        ctx,
        `match por inmovillaAgentId=${input.inmovillaAgentId} → id=${result.id} inmovillaRefCode=${result.inmovillaRefCode ?? "null"}`,
      );
      return result;
    }
    traceLog(
      ctx,
      result
        ? `inmovillaAgentId=${input.inmovillaAgentId} encontrado pero inactivo (activo=${result.activo})`
        : `inmovillaAgentId=${input.inmovillaAgentId} sin fila Comercial (campo inmovillaAgentId vacío en BD para todos los comerciales o ID distinto)`,
    );
  } else {
    traceLog(ctx, "paso inmovillaAgentId omitido (null/undefined)");
  }

  const code = input.refCode?.trim().toUpperCase();
  if (code) {
    const result = await prisma.comercial.findFirst({
      where: {
        inmovillaRefCode: { equals: code, mode: "insensitive" },
        ...(active ? { activo: true } : {}),
      },
      select: BASIC_SELECT,
    });
    if (result) {
      traceLog(ctx, `match por inmovillaRefCode="${code}" → id=${result.id} inmovillaAgentId=${result.inmovillaAgentId ?? "null"}`);
      return result;
    }
    traceLog(
      ctx,
      `inmovillaRefCode="${code}" sin coincidencia (ningún Comercial activo con ese inmovillaRefCode)`,
    );
  } else {
    traceLog(ctx, "paso inmovillaRefCode omitido (vacío)");
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
    if (result) {
      traceLog(ctx, `match por nombre exacto (insensitive) → id=${result.id}`);
      return result;
    }
    traceLog(
      ctx,
      `nombre="${nombre}" sin coincidencia exacta en Comercial.nombre (Inmovilla suele mandar solo primer nombre; en BD puede estar el nombre completo)`,
    );
  } else {
    traceLog(ctx, "paso nombre omitido (vacío)");
  }

  traceLog(ctx, "resultado final: null (ningún criterio resolvió comercial)");
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
 * Resuelve un Comercial a partir de una ref de Inmovilla (ej. "URUS111VMA").
 * Parsea la ref para extraer las iniciales y busca por Comercial.inmovillaRefCode.
 */
export async function resolveComercialFromRef(
  ref: string | null | undefined,
  opts?: { requireActive?: boolean; traceContext?: string },
): Promise<ComercialBasic | null> {
  const ctx = opts?.traceContext;
  const raw = (ref ?? "").trim();
  const code = extractRefCode(raw);
  if (!code) {
    traceLog(
      ctx,
      `fallback ref: valor="${raw.slice(0, 80)}${raw.length > 80 ? "…" : ""}" → extractRefCode=null (no coincide patrón URUS…; en demandas ref suele ser numdemanda)`,
    );
    return null;
  }

  traceLog(ctx, `fallback ref: extractRefCode="${code}" → segunda búsqueda por inmovillaRefCode`);
  return resolveComercial({
    refCode: code,
    requireActive: opts?.requireActive,
    traceContext: ctx ? `${ctx}:ref` : undefined,
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
    select: { agente: true, comercialId: true, ref: true },
  });
  if (!property) return null;

  if (property.comercialId) {
    const result = await resolveComercial({ comercialId: property.comercialId });
    if (result) return result;
  }

  const byAgente = await resolveComercialFromAgente(property.agente);
  if (byAgente) return byAgente;

  return resolveComercialFromRef(property.ref);
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
    select: { agente: true, comercialId: true, ref: true },
  });
  if (!demand) return null;

  if (demand.comercialId) {
    const result = await resolveComercial({ comercialId: demand.comercialId });
    if (result) return result;
  }

  const byAgente = await resolveComercialFromAgente(demand.agente);
  if (byAgente) return byAgente;

  return resolveComercialFromRef(demand.ref);
}
